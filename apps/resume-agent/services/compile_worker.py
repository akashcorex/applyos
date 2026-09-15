"""Standalone async compile worker.

Run with ``python -m services.compile_worker`` (see the ``worker`` npm
script). Any number of replicas may run concurrently: jobs are claimed with
``SELECT ... FOR UPDATE SKIP LOCKED``, and completion (job-ready + variant
pointers + finalize snapshot) commits in a single transaction so a crash can
never leave ``job=ready`` with ``variant!=ready``.

The worker is the only place that may invoke LaTeX compilation
(``latex_worker`` sandbox via :class:`ResumeCompiler`); FastAPI request
handlers never run a subprocess.

MVP infrastructure note: worker and API share artifact/source storage (local
``uploads/`` volume today). Before running them on separate hosts without a
shared volume, move to object storage.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import signal

import asyncpg

from config import settings
from models import (
    CompileJob,
    DiffContract,
    JobProfile,
    ResumeIR,
    TailoringPatch,
    VariantContent,
)
from services.compile_jobs import (
    CompileJobRepository,
    JobAttemptLostError,
    JobNotFoundError,
)
from services.compiler import ResumeCompiler
from services.latex_sources import LatexSourceRepository
from services.revisions import RevisionNotFoundError, RevisionRepository
from services.ir import sha256_bytes
from services.tailoring import VariantNotFoundError, VariantRepository
from services.tailoring.versions import VersionRepository

logger = logging.getLogger("compile_worker")


async def _init_connection(conn: asyncpg.Connection) -> None:
    # Same jsonb codec as the API pool (see AppState._init_connection).
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


class CompileWorker:
    """Claims due jobs and compiles them to content-addressed artifacts."""

    def __init__(
        self,
        pool: asyncpg.Pool,
        *,
        jobs: CompileJobRepository | None = None,
        revisions: RevisionRepository | None = None,
        latex_sources: LatexSourceRepository | None = None,
        variants: VariantRepository | None = None,
        versions: VersionRepository | None = None,
        compiler: ResumeCompiler | None = None,
        claim_timeout_seconds: float | None = None,
        retry_base_seconds: float | None = None,
        retry_max_seconds: float | None = None,
        error_max_chars: int | None = None,
    ) -> None:
        self._pool = pool
        self._jobs = jobs or CompileJobRepository(pool)
        self._revisions = revisions or RevisionRepository(pool)
        self._latex_sources = latex_sources or LatexSourceRepository(pool)
        self._variants = variants or VariantRepository(pool)
        self._versions = versions
        self._compiler = compiler or ResumeCompiler(
            revision_repository=self._revisions,
            latex_source_repository=self._latex_sources,
        )
        self._claim_timeout = (
            settings.compile_claim_timeout_seconds
            if claim_timeout_seconds is None
            else claim_timeout_seconds
        )
        self._retry_base = (
            settings.compile_retry_base_seconds
            if retry_base_seconds is None
            else retry_base_seconds
        )
        self._retry_max = (
            settings.compile_retry_max_seconds
            if retry_max_seconds is None
            else retry_max_seconds
        )
        self._error_max = (
            settings.compile_job_error_max_chars
            if error_max_chars is None
            else error_max_chars
        )

    async def run_once(self, *, batch_size: int = 1) -> int:
        """Reclaim stale rows, claim due jobs, process them. Returns count."""
        await self._jobs.reclaim_stale(timeout_seconds=self._claim_timeout)
        jobs = await self._jobs.claim(limit=batch_size)
        for job in jobs:
            await self.process_job(job)
        return len(jobs)

    async def process_job(self, job: CompileJob) -> CompileJob:
        logger.info(
            "Processing compile job id=%s kind=%s attempt=%d",
            job.id,
            job.kind,
            job.attempts,
        )
        try:
            artifact_hash = await self._compile_job(job)
        except JobNotFoundError as exc:
            # Job row vanished mid-flight (e.g. resume deleted cascade).
            logger.warning("Compile job id=%s disappeared: %s", job.id, exc)
            return job
        except (RevisionNotFoundError, VariantNotFoundError) as exc:
            return await self._fail(job, f"Missing compile input: {exc}")
        except Exception as exc:  # noqa: BLE001 - must record, never crash loop
            return await self._fail(job, f"{type(exc).__name__}: {exc}")
        try:
            return await self._complete(job, artifact_hash)
        except JobAttemptLostError:
            logger.info("Ignoring stale compile completion for job id=%s", job.id)
            return job

    async def _compile_job(self, job: CompileJob) -> str:
        if not job.source_revision_id:
            raise ValueError("Job has no source revision")
        ir: ResumeIR = await self._revisions.get_revision(
            job.resume_id, job.source_revision_id
        )
        patch: TailoringPatch | None = None
        if job.patch_id:
            patch = await self._revisions.get_patch(job.patch_id)
        content = VariantContent.model_validate(job.content)
        job_profile = JobProfile.model_validate(job.job_profile)
        diff = DiffContract.model_validate(job.diff or {})
        if (
            job.tex_source is not None
            and job.tex_source_hash != sha256_bytes(job.tex_source.encode("utf-8"))
        ):
            raise ValueError("Compile job LaTeX source hash mismatch")
        artifact = await self._compiler.compile(
            user_id=job.user_id,
            resume_id=job.resume_id,
            source_revision_id=job.source_revision_id,
            ir=ir,
            content=content,
            job_profile=job_profile,
            variant_id=job.variant_id,
            patch=patch,
            diff=diff,
            tex_source=job.tex_source,
            template_id=job.template_id,
            allow_fallback=job.source_mode != "latex",
        )
        return artifact.artifact_hash

    async def _complete(self, job: CompileJob, artifact_hash: str) -> CompileJob:
        """Commit job-ready + variant pointers (+ finalize snapshot) atomically."""
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                fence = (
                    {
                        "expected_attempt": job.attempts,
                        "claim_token": job.claim_token,
                    }
                    if job.claim_token
                    else {}
                )
                updated = await self._jobs.mark_ready(
                    job.id,
                    artifact_hash,
                    **fence,
                    conn=conn,
                )
                if job.variant_id:
                    patch_id = job.patch_id
                    if job.variant_generation is not None and hasattr(
                        self._variants, "update_compile_result"
                    ):
                        applied = await self._variants.update_compile_result(
                            job.resume_id,
                            job.variant_id,
                            generation=job.variant_generation,
                            source_revision_id=job.source_revision_id,
                            patch_id=patch_id,
                            artifact_id=artifact_hash,
                            status="ready" if job.kind == "finalize" else None,
                            conn=conn,
                        )
                    else:
                        await self._variants.update(
                            job.resume_id,
                            job.variant_id,
                            source_revision_id=job.source_revision_id,
                            patch_id=patch_id,
                            artifact_id=artifact_hash,
                            status="ready" if job.kind == "finalize" else None,
                            conn=conn,
                        )
                        applied = True
                    if (
                        applied
                        and job.kind == "finalize"
                        and self._versions is not None
                    ):
                        await self._versions.save_snapshot(
                            variant_id=job.variant_id,
                            resume_id=job.resume_id,
                            content=VariantContent.model_validate(job.content),
                            change_reason="finalize",
                            conn=conn,
                        )
        logger.info(
            "Compile job id=%s ready artifact=%s", job.id, artifact_hash
        )
        return updated

    async def _fail(self, job: CompileJob, error: str) -> CompileJob:
        try:
            fence = (
                {
                    "expected_attempt": job.attempts,
                    "claim_token": job.claim_token,
                }
                if job.claim_token
                else {}
            )
            return await self._jobs.mark_failed(
                job.id,
                error,
                attempts=job.attempts,
                max_attempts=job.max_attempts,
                retry_base_seconds=self._retry_base,
                retry_max_seconds=self._retry_max,
                **fence,
                error_max_chars=self._error_max,
            )
        except JobAttemptLostError:
            logger.info("Ignoring stale compile failure for job id=%s", job.id)
            return job


async def _run_forever(*, poll_seconds: float, batch_size: int) -> None:
    pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=1,
        max_size=5,
        init=_init_connection,
    )
    worker = CompileWorker(pool, versions=VersionRepository(pool))
    stop = asyncio.Event()

    def _request_stop(*_args: object) -> None:
        logger.info("Shutdown requested; draining current job then exiting")
        stop.set()

    loop = asyncio.get_running_loop()
    for signal_name in ("SIGINT", "SIGTERM"):
        try:
            loop.add_signal_handler(
                getattr(signal, signal_name), _request_stop
            )
        except (AttributeError, NotImplementedError, RuntimeError):
            pass

    logger.info("Compile worker started (poll=%.1fs batch=%d)", poll_seconds, batch_size)
    try:
        while not stop.is_set():
            try:
                processed = await worker.run_once(batch_size=batch_size)
            except Exception as exc:  # noqa: BLE001 - loop must survive
                logger.error("Worker iteration failed: %s", exc)
                processed = 0
            if processed == 0:
                try:
                    await asyncio.wait_for(stop.wait(), timeout=poll_seconds)
                except asyncio.TimeoutError:
                    pass
    finally:
        await pool.close()
        logger.info("Compile worker stopped")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ApplyOS resume compile worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process due jobs once and exit (useful for cron/one-shot runs)",
    )
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--poll-seconds", type=float, default=None)
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    batch_size = args.batch_size or settings.compile_worker_batch_size
    poll_seconds = args.poll_seconds or settings.compile_worker_poll_seconds

    if args.once:
        async def _once() -> None:
            pool = await asyncpg.create_pool(
                dsn=settings.database_url,
                min_size=1,
                max_size=5,
                init=_init_connection,
            )
            try:
                worker = CompileWorker(pool, versions=VersionRepository(pool))
                processed = await worker.run_once(batch_size=batch_size)
                logger.info("One-shot run processed %d job(s)", processed)
            finally:
                await pool.close()

        asyncio.run(_once())
        return 0

    asyncio.run(_run_forever(poll_seconds=poll_seconds, batch_size=batch_size))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
