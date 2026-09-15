"""Phase 2 async compile job tests.

Covers: SKIP LOCKED claiming, enqueue/get roundtrip, worker success +
artifact creation, failure/retry/timeout behavior, finalize atomicity, hash
parity, the no-subprocess-in-request rule, and job route ownership. No
database required (FakePool doubles follow the Phase 1 pattern).
"""

from __future__ import annotations

import shutil
import re
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from models import (
    CompileJob,
    DiffContract,
    Education,
    JobProfile,
    ResumeIR,
    ResumeRecord,
    TailoringPatch,
    VariantContent,
    WorkHistory,
)
from services.compile_jobs import (
    CompileJobRepository,
    JobAttemptLostError,
    JobNotFoundError,
)
from services.compile_worker import CompileWorker
from services.compiler import ResumeCompiler, build_artifact_hash
from services.ir import build_patch, ir_hash, record_to_ir, sha256_bytes, sha256_json


@pytest.mark.asyncio
async def test_runtime_compile_job_compatibility_adds_snapshot_columns() -> None:
    from dependencies import _ensure_compile_job_compatibility

    class FakeConnection:
        def __init__(self) -> None:
            self.statements: list[str] = []

        async def execute(self, statement: str) -> None:
            self.statements.append(statement)

    connection = FakeConnection()
    await _ensure_compile_job_compatibility(connection)  # type: ignore[arg-type]
    sql = "\n".join(connection.statements)
    for column in (
        "source_mode",
        "latex_source_id",
        "tex_source",
        "tex_source_hash",
        "variant_generation",
        "claim_token",
    ):
        assert f"ADD COLUMN IF NOT EXISTS {column}" in sql


def _record() -> ResumeRecord:
    return ResumeRecord(
        user_id="compile-job-user",
        full_name="Jane Doe",
        email="jane@example.com",
        summary="Backend engineer with Python experience.",
        experience_years=5,
        skills=["Python", "PostgreSQL"],
        education=[Education(degree="BS CS", school="MIT", year=2018)],
        work_history=[
            WorkHistory(
                company="Acme",
                title="Senior Engineer",
                start_date="2021-01",
                highlights=["Built APIs serving 2M requests/day."],
            )
        ],
        raw_text="Jane Doe\nBackend engineer with Python experience.",
    )


def _content(record: ResumeRecord) -> VariantContent:
    return VariantContent(
        full_name=record.full_name,
        email=record.email,
        summary=record.summary,
        experience_years=record.experience_years,
        skills=record.skills,
        education=record.education,
        work_history=record.work_history,
    )


@pytest.fixture()
def _clean_uploads():
    yield
    for user in ("compile-job-user",):
        shutil.rmtree(
            Path(__file__).resolve().parent.parent
            / "apps"
            / "resume-agent"
            / "uploads"
            / user,
            ignore_errors=True,
        )


# --- FakePool: in-memory asyncpg double with locking semantics ---


class _FakeTransaction:
    def __init__(self, conn: "_FakeConn") -> None:
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        return False


class _FakeConn:
    _id_counter = 0

    def __init__(self, pool: "_FakePool") -> None:
        _FakeConn._id_counter += 1
        self.conn_id = _FakeConn._id_counter
        self._pool = pool

    def transaction(self):
        return _FakeTransaction(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def fetch(self, sql, *args):
        return await self._pool._fetch(sql, args, self)

    async def fetchrow(self, sql, *args):
        return await self._pool._fetchrow(sql, args, self)

    async def fetchval(self, sql, *args):
        row = await self._pool._fetchrow(sql, args, self)
        if row is None:
            return None
        return next(iter(row.values()))

    async def execute(self, sql, *args):
        return await self._pool._execute(sql, args, self)


class _FakePool:
    """Mimics the subset of asyncpg used by the queue: INSERT, SELECT with
    FOR UPDATE SKIP LOCKED (locked rows are invisible to other claims),
    UPDATE ... RETURNING, and UPDATE status strings."""

    def __init__(self) -> None:
        self.jobs: dict[str, dict] = {}
        self.queries: list[str] = []
        self._seq = 0

    def acquire(self):
        return _FakeConn(self)

    async def _fetchrow(self, sql, args, conn):
        self.queries.append(sql)
        upper = sql.strip().upper()
        if upper.startswith("INSERT"):
            self._seq += 1
            now = datetime.now(timezone.utc)
            row = {
                "id": f"job-{self._seq}",
                "resume_id": str(args[0]),
                "user_id": args[1],
                "variant_id": str(args[2]) if args[2] else None,
                "kind": args[3],
                "status": "queued",
                "template_id": args[4],
                "job_profile": args[5],
                "content": args[6],
                "diff": args[7],
                "source_revision_id": str(args[8]) if args[8] else None,
                "patch_id": str(args[9]) if args[9] else None,
                "max_attempts": args[10],
                "latex_source_id": str(args[11]) if len(args) > 11 and args[11] else None,
                "tex_source": args[12] if len(args) > 12 else None,
                "tex_source_hash": args[13] if len(args) > 13 else None,
                "variant_generation": args[14] if len(args) > 14 else None,
                "source_mode": args[15] if len(args) > 15 else "structured",
                "artifact_hash": None,
                "attempts": 0,
                "run_after": now,
                "started_at": None,
                "finished_at": None,
                "last_error": None,
                "created_at": now,
                "updated_at": now,
            }
            self.jobs[row["id"]] = row
            return dict(row)
        if "RESUME_COMPILE_JOBS" in upper and "WHERE ID = $1" in upper:
            if upper.startswith("SELECT"):
                row = self.jobs.get(str(args[0]))
                return dict(row) if row else None
            # UPDATE ... WHERE id = $1 [RETURNING *]
            row = self.jobs.get(str(args[0]))
            if row is None:
                return None
            return self._apply_update(sql, args, row)
        if "FOR UPDATE" in upper:
            limit = args[0] if args else 1
            now = datetime.now(timezone.utc)
            due = [
                row
                for row in sorted(
                    self.jobs.values(), key=lambda r: r["created_at"]
                )
                if row["status"] == "queued" and row["run_after"] <= now
                and row["attempts"] < row["max_attempts"]
            ]
            return [dict(row) for row in due[:limit]]
        raise AssertionError(f"Unexpected fetchrow: {sql[:80]}")

    async def _fetch(self, sql, args, conn):
        self.queries.append(sql)
        if "FOR UPDATE" in sql.upper():
            row = await self._fetchrow(sql, args, conn)
            return row if isinstance(row, list) else ([row] if row else [])
        raise AssertionError(f"Unexpected fetch: {sql[:80]}")

    async def _execute(self, sql, args, conn):
        self.queries.append(sql)
        if "STATUS = 'COMPILING'" in sql.upper():
            timeout = float(args[0])
            cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout)
            count = 0
            for row in self.jobs.values():
                if row["status"] == "compiling" and row["started_at"] < cutoff:
                    row["status"] = (
                        "failed"
                        if row["attempts"] >= row["max_attempts"]
                        else "queued"
                    )
                    row["run_after"] = datetime.now(timezone.utc)
                    count += 1
            return f"UPDATE {count}"
        raise AssertionError(f"Unexpected execute: {sql[:80]}")

    def _apply_update(self, sql, args, row):
        normalized = sql.upper()

        def fence_matches() -> bool:
            attempt_match = re.search(r"ATTEMPTS = \$(\d+)", normalized)
            if attempt_match is not None:
                attempt_index = int(attempt_match.group(1)) - 1
                if row["attempts"] != args[attempt_index]:
                    return False
            claim_match = re.search(r"CLAIM_TOKEN = \$(\d+)", normalized)
            if claim_match is not None:
                claim_index = int(claim_match.group(1)) - 1
                if str(row.get("claim_token")) != str(args[claim_index]):
                    return False
            return True

        # Mark-ready shape: SET status='ready', artifact_hash=$2 ...
        if "STATUS = 'READY'" in normalized:
            if not fence_matches():
                return None
            row["status"] = "ready"
            row["artifact_hash"] = args[1]
            row["finished_at"] = datetime.now(timezone.utc)
            row["updated_at"] = datetime.now(timezone.utc)
            return dict(row)
        if "SET STATUS = 'COMPILING'" in normalized:
            row["status"] = "compiling"
            row["attempts"] += 1
            row["claim_token"] = f"claim-{row['id']}-{row['attempts']}"
            row["started_at"] = datetime.now(timezone.utc)
            row["updated_at"] = datetime.now(timezone.utc)
            return dict(row)
        if "STATUS = 'QUEUED'" in normalized and "RUN_AFTER" in normalized:
            if not fence_matches():
                return None
            row["status"] = "queued"
            row["last_error"] = args[1]
            try:
                backoff = float(args[2])
            except (IndexError, TypeError, ValueError):
                backoff = 0.0
            row["run_after"] = datetime.now(timezone.utc) + timedelta(
                seconds=backoff
            )
            row["updated_at"] = datetime.now(timezone.utc)
            return dict(row)
        if "SET STATUS = 'FAILED'" in normalized:
            if not fence_matches():
                return None
            row["status"] = "failed"
            row["last_error"] = args[1]
            row["finished_at"] = datetime.now(timezone.utc)
            row["updated_at"] = datetime.now(timezone.utc)
            return dict(row)
        raise AssertionError(f"Unexpected update: {sql[:120]}")


def _repo(pool=None) -> CompileJobRepository:
    return CompileJobRepository(pool or _FakePool())  # type: ignore[arg-type]


def _enqueue_kwargs(**overrides):
    record = _record()
    base = dict(
        resume_id="resume-1",
        user_id="compile-job-user",
        variant_id="variant-1",
        kind="preview",
        template_id="applyos-ats",
        job_profile={"title": "Backend Engineer"},
        content=_content(record).model_dump(mode="json"),
        diff={},
        source_revision_id="revision-1",
        patch_id=None,
        max_attempts=3,
    )
    base.update(overrides)
    return base


# --- queue semantics ---


@pytest.mark.asyncio
async def test_enqueue_get_roundtrip() -> None:
    repo = _repo()
    job = await repo.enqueue(**_enqueue_kwargs())
    assert job.status == "queued"
    assert job.attempts == 0
    assert job.content["full_name"] == "Jane Doe"
    fetched = await repo.get(job.id)
    assert fetched.id == job.id
    with pytest.raises(JobNotFoundError):
        await repo.get("missing")


@pytest.mark.asyncio
async def test_enqueue_sql_maps_source_mode_once() -> None:
    pool = _FakePool()
    repo = _repo(pool)
    job = await repo.enqueue(**_enqueue_kwargs(source_mode="latex"))

    insert_sql = next(
        query for query in pool.queries if query.strip().upper().startswith("INSERT")
    )
    assert insert_sql.lower().count("source_mode") == 1
    assert job.template_id == "applyos-ats"
    assert job.job_profile["title"] == "Backend Engineer"
    assert job.source_mode == "latex"


@pytest.mark.asyncio
async def test_claim_uses_skip_locked_and_skips_claimed() -> None:
    pool = _FakePool()
    repo = _repo(pool)
    first = await repo.enqueue(**_enqueue_kwargs())
    second = await repo.enqueue(**_enqueue_kwargs())
    claimed = await repo.claim(limit=2)
    assert [job.id for job in claimed] == [first.id, second.id]
    assert any("FOR UPDATE SKIP LOCKED" in query for query in pool.queries)
    assert all(job.status == "compiling" for job in claimed)
    assert all(job.attempts == 1 for job in claimed)
    # Second claim sees nothing: rows are locked/in-progress.
    assert await repo.claim(limit=2) == []


@pytest.mark.asyncio
async def test_claim_respects_run_after() -> None:
    pool = _FakePool()
    repo = _repo(pool)
    job = await repo.enqueue(**_enqueue_kwargs())
    pool.jobs[job.id]["run_after"] = datetime.now(timezone.utc) + timedelta(hours=1)
    assert await repo.claim() == []


@pytest.mark.asyncio
async def test_reclaim_stale_compiling_jobs() -> None:
    pool = _FakePool()
    repo = _repo(pool)
    job = await repo.enqueue(**_enqueue_kwargs())
    claimed = await repo.claim()
    assert claimed[0].status == "compiling"
    # Fresh claim is not stale.
    assert await repo.reclaim_stale(timeout_seconds=120) == 0
    # Age it past the timeout: reclaimed exactly once.
    pool.jobs[job.id]["started_at"] = datetime.now(timezone.utc) - timedelta(hours=1)
    assert await repo.reclaim_stale(timeout_seconds=120) == 1
    reclaimed = await repo.get(job.id)
    assert reclaimed.status == "queued"
    assert reclaimed.attempts == 1  # attempts preserved for retry accounting


@pytest.mark.asyncio
async def test_reclaim_stale_job_at_attempt_limit_fails_terminally() -> None:
    pool = _FakePool()
    repo = _repo(pool)
    job = await repo.enqueue(**_enqueue_kwargs(max_attempts=1))
    [claimed] = await repo.claim()
    pool.jobs[job.id]["started_at"] = datetime.now(timezone.utc) - timedelta(
        hours=1
    )

    assert await repo.reclaim_stale(timeout_seconds=120) == 1
    reclaimed = await repo.get(job.id)
    assert claimed.attempts == 1
    assert reclaimed.status == "failed"


@pytest.mark.asyncio
async def test_mark_failed_retries_then_terminal() -> None:
    pool = _FakePool()
    repo = _repo(pool)
    job = await repo.enqueue(**_enqueue_kwargs(max_attempts=2))
    [claimed] = await repo.claim()
    retried = await repo.mark_failed(
        claimed.id,
        "boom",
        attempts=claimed.attempts,
        max_attempts=claimed.max_attempts,
        retry_base_seconds=10,
        retry_max_seconds=300,
    )
    assert retried.status == "queued"
    assert retried.last_error == "boom"
    assert pool.jobs[job.id]["run_after"] > datetime.now(timezone.utc)
    # Immediate reclaim is blocked by backoff; simulate time passing.
    pool.jobs[job.id]["run_after"] = datetime.now(timezone.utc) - timedelta(
        seconds=1
    )
    [claimed2] = await repo.claim()
    terminal = await repo.mark_failed(
        claimed2.id,
        "x" * 5000,
        attempts=claimed2.attempts,
        max_attempts=claimed2.max_attempts,
        retry_base_seconds=10,
        retry_max_seconds=300,
        error_max_chars=2000,
    )
    assert terminal.status == "failed"
    assert terminal.last_error is not None and len(terminal.last_error) <= 2000


# --- hash parity between enqueue fast-path and worker ---


def test_build_artifact_hash_matches_legacy_inputs() -> None:
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    content = _content(record)
    profile = JobProfile(title="Backend Engineer")
    expected = sha256_json(
        {
            "ir_hash": ir_hash(ir),
            "source_revision_id": "revision-1",
            "content": content.model_dump(mode="json"),
            "job_profile": profile.model_dump(mode="json"),
            "patch": None,
            "compiler_version": "resume-compiler.v1",
            "template_version": "ats-latex.v1",
        }
    )
    assert (
        build_artifact_hash(
            ir=ir,
            source_revision_id="revision-1",
            content=content,
            job_profile=profile,
            patch=None,
            template_version="ats-latex.v1",
        )
        == expected
    )


def test_build_artifact_hash_template_path_differs() -> None:
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    content = _content(record)
    profile = JobProfile(title="Backend Engineer")
    legacy = build_artifact_hash(
        ir=ir,
        source_revision_id="revision-1",
        content=content,
        job_profile=profile,
        patch=None,
        template_version="ats-latex.v1",
    )
    templated = build_artifact_hash(
        ir=ir,
        source_revision_id="revision-1",
        content=content,
        job_profile=profile,
        patch=None,
        template_version="ats-latex.v1",
        tex_source_hash="abc",
        template_id="applyos-ats",
    )
    assert templated != legacy


def test_build_artifact_hash_separates_renderers() -> None:
    """FPDF fallback output must never be served under a LaTeX compile's address."""
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    content = _content(record)
    profile = JobProfile(title="Backend Engineer")
    common = dict(
        ir=ir,
        source_revision_id="revision-1",
        content=content,
        job_profile=profile,
        patch=None,
        template_version="ats-latex.v1",
        tex_source_hash="abc",
        template_id="applyos-ats",
    )
    assert build_artifact_hash(**common, renderer="tectonic") != build_artifact_hash(
        **common, renderer="fpdf-development-fallback"
    )


def test_migrations_are_idempotent_against_startup_ddl() -> None:
    """resume-agent creates these objects at boot; migrate deploy must tolerate it."""
    root = Path(__file__).resolve().parents[1] / "packages/database/prisma/migrations"
    for name in (
        "03_resume_latex_sources",
        "04_resume_compile_jobs",
        "05_resume_compile_source_snapshot",
    ):
        sql = (root / name / "migration.sql").read_text()
        assert not re.search(r"CREATE TABLE(?! IF NOT EXISTS)", sql), name
        assert not re.search(r"CREATE INDEX(?! IF NOT EXISTS)", sql), name
        assert not re.search(r"ADD COLUMN(?! IF NOT EXISTS)", sql), name
        for match in re.finditer(r"ADD CONSTRAINT \"(\w+)\"", sql):
            assert f"conname = '{match.group(1)}'" in sql, (name, match.group(1))


# --- worker success / failure with fakes ---


class _StubRevisions:
    def __init__(self, ir: ResumeIR, patch: TailoringPatch | None = None) -> None:
        self._ir = ir
        self._patch = patch
        self.saved_artifacts: list = []

    async def get_revision(self, resume_id: str, revision_id: str) -> ResumeIR:
        return self._ir

    async def get_patch(self, patch_id: str) -> TailoringPatch:
        assert self._patch is not None
        return self._patch

    async def get_artifact_by_hash(self, resume_id: str, artifact_hash: str):
        return None

    async def save_artifact(self, *, artifact):
        self.saved_artifacts.append(artifact)
        return artifact


class _StubVariants:
    def __init__(self) -> None:
        self.updates: list[tuple[dict, int | None]] = []

    async def update(self, resume_id, variant_id, **kwargs):
        conn = kwargs.pop("conn", None)
        self.updates.append((kwargs, getattr(conn, "conn_id", None)))
        return {"ok": True}


class _GenerationVariants:
    def __init__(self, applied: bool) -> None:
        self.applied = applied
        self.results: list[dict] = []

    async def update_compile_result(self, resume_id, variant_id, **kwargs):
        self.results.append(kwargs)
        return self.applied


class _StubVersions:
    def __init__(self) -> None:
        self.snapshots: list[tuple[dict, int | None]] = []

    async def save_snapshot(self, *, variant_id, resume_id, content, change_reason, conn=None):
        self.snapshots.append(
            ({"change_reason": change_reason}, getattr(conn, "conn_id", None))
        )
        return "version-1"


def _worker_job(**overrides) -> CompileJob:
    record = _record()
    base = dict(
        id="job-1",
        resume_id="resume-1",
        user_id="compile-job-user",
        variant_id="variant-1",
        kind="preview",
        status="queued",
        template_id="applyos-ats",
        job_profile={"title": "Backend Engineer"},
        content=_content(record).model_dump(mode="json"),
        diff={},
        source_revision_id="revision-1",
        patch_id=None,
        attempts=1,
        max_attempts=3,
    )
    base.update(overrides)
    return CompileJob(**base)


@pytest.mark.asyncio
async def test_worker_success_creates_artifact_and_completes(_clean_uploads) -> None:
    pool = _FakePool()
    jobs = CompileJobRepository(pool)  # type: ignore[arg-type]
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    revisions = _StubRevisions(ir)
    variants = _StubVariants()
    versions = _StubVersions()
    worker = CompileWorker(
        pool,  # type: ignore[arg-type]
        jobs=jobs,
        revisions=revisions,  # type: ignore[arg-type]
        variants=variants,  # type: ignore[arg-type]
        versions=versions,  # type: ignore[arg-type]
        compiler=ResumeCompiler(revision_repository=revisions),  # type: ignore[arg-type]
    )
    stored = await jobs.enqueue(**_enqueue_kwargs())
    [claimed] = await jobs.claim()
    done = await worker.process_job(claimed)
    assert done.status == "ready"
    assert done.artifact_hash
    assert len(revisions.saved_artifacts) == 1
    assert revisions.saved_artifacts[0].artifact_hash == done.artifact_hash
    # Preview kind: pointers updated, status untouched, no version snapshot.
    assert len(variants.updates) == 1
    assert variants.updates[0][0].get("status") is None
    assert variants.updates[0][0]["artifact_id"] == done.artifact_hash
    assert versions.snapshots == []
    _ = stored


@pytest.mark.asyncio
async def test_worker_finalize_commits_atomically(_clean_uploads) -> None:
    pool = _FakePool()
    jobs = CompileJobRepository(pool)  # type: ignore[arg-type]
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    variants = _StubVariants()
    versions = _StubVersions()
    ready_conns: list[int | None] = []
    orig_mark_ready = jobs.mark_ready

    async def _mark_ready(job_id, artifact_hash, conn=None):
        ready_conns.append(getattr(conn, "conn_id", None))
        # Simulate the job row existing outside the fake insert path.
        pool.jobs[job_id] = {
            "id": job_id,
            "resume_id": "resume-1",
            "user_id": "compile-job-user",
            "variant_id": "variant-1",
            "kind": "finalize",
            "status": "ready",
            "template_id": "applyos-ats",
            "job_profile": {},
            "content": {},
            "diff": {},
            "source_revision_id": "revision-1",
            "patch_id": None,
            "artifact_hash": artifact_hash,
            "attempts": 1,
            "max_attempts": 3,
            "run_after": datetime.now(timezone.utc),
            "started_at": datetime.now(timezone.utc),
            "finished_at": datetime.now(timezone.utc),
            "last_error": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        return await orig_mark_ready(job_id, artifact_hash, conn=conn)

    jobs.mark_ready = _mark_ready  # type: ignore[method-assign]
    worker = CompileWorker(
        pool,  # type: ignore[arg-type]
        jobs=jobs,
        revisions=_StubRevisions(ir),  # type: ignore[arg-type]
        variants=variants,  # type: ignore[arg-type]
        versions=versions,  # type: ignore[arg-type]
        compiler=ResumeCompiler(),
    )
    job = _worker_job(kind="finalize")
    done = await worker.process_job(job)
    assert done.status == "ready"
    assert variants.updates[0][0]["status"] == "ready"
    assert versions.snapshots[0][0]["change_reason"] == "finalize"
    # All three writes shared one connection/transaction.
    conns = {
        ready_conns[0],
        variants.updates[0][1],
        versions.snapshots[0][1],
    }
    assert len(conns) == 1 and None not in conns


@pytest.mark.asyncio
async def test_worker_failure_marks_failed_without_tex_in_error() -> None:
    pool = _FakePool()
    jobs = CompileJobRepository(pool)  # type: ignore[arg-type]
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")

    class _BoomCompiler(ResumeCompiler):
        async def compile(self, **kwargs):  # type: ignore[no-untyped-def]
            raise RuntimeError("สูงสุด " + "x" * 5000)

    worker = CompileWorker(
        pool,  # type: ignore[arg-type]
        jobs=jobs,
        revisions=_StubRevisions(ir),  # type: ignore[arg-type]
        compiler=_BoomCompiler(),
        error_max_chars=2000,
    )
    stored = await jobs.enqueue(**_enqueue_kwargs(max_attempts=1))
    [claimed] = await jobs.claim()
    done = await worker.process_job(claimed)
    assert done.status == "failed"
    assert done.last_error is not None and len(done.last_error) <= 2000
    _ = stored


@pytest.mark.asyncio
async def test_worker_passes_snapshotted_tex_source_to_compiler() -> None:
    pool = _FakePool()
    jobs = CompileJobRepository(pool)  # type: ignore[arg-type]
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    captured: dict = {}

    class _CaptureCompiler:
        async def compile(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(artifact_hash="artifact-hash")

    worker = CompileWorker(
        pool,  # type: ignore[arg-type]
        jobs=jobs,
        revisions=_StubRevisions(ir),  # type: ignore[arg-type]
        compiler=_CaptureCompiler(),  # type: ignore[arg-type]
    )
    job = _worker_job(
        tex_source="\\documentclass{article}\\begin{document}Exact source\\end{document}",
        tex_source_hash=sha256_bytes(
            b"\\documentclass{article}\\begin{document}Exact source\\end{document}"
        ),
    )
    assert await worker._compile_job(job) == "artifact-hash"
    assert captured["tex_source"] == job.tex_source
    assert captured["allow_fallback"] is True

    captured.clear()
    raw_job = _worker_job(
        source_mode="latex",
        tex_source=job.tex_source,
        tex_source_hash=job.tex_source_hash,
    )
    assert await worker._compile_job(raw_job) == "artifact-hash"
    assert captured["allow_fallback"] is False


@pytest.mark.asyncio
async def test_stale_worker_completion_does_not_update_variant() -> None:
    pool = _FakePool()
    jobs = CompileJobRepository(pool)  # type: ignore[arg-type]
    stored = await jobs.enqueue(**_enqueue_kwargs(variant_generation=1))
    [claimed] = await jobs.claim()
    variants = _GenerationVariants(applied=False)
    worker = CompileWorker(
        pool,  # type: ignore[arg-type]
        jobs=jobs,
        revisions=_StubRevisions(record_to_ir(_record(), source_document_hash="h")),  # type: ignore[arg-type]
        variants=variants,  # type: ignore[arg-type]
        versions=_StubVersions(),  # type: ignore[arg-type]
        compiler=ResumeCompiler(),
    )
    done = await worker._complete(claimed, "artifact-hash")
    assert done.status == "ready"
    assert len(variants.results) == 1
    assert stored.id == claimed.id


@pytest.mark.asyncio
async def test_stale_claim_token_cannot_complete_or_fail_job() -> None:
    pool = _FakePool()
    jobs = CompileJobRepository(pool)  # type: ignore[arg-type]
    stored = await jobs.enqueue(**_enqueue_kwargs())
    [claimed] = await jobs.claim()

    with pytest.raises(JobAttemptLostError):
        await jobs.mark_ready(
            stored.id,
            "artifact-hash",
            expected_attempt=claimed.attempts,
            claim_token="wrong-claim-token",
        )

    with pytest.raises(JobAttemptLostError):
        await jobs.mark_failed(
            stored.id,
            "stale failure",
            attempts=claimed.attempts,
            max_attempts=3,
            retry_base_seconds=0,
            retry_max_seconds=0,
            expected_attempt=claimed.attempts,
            claim_token="wrong-claim-token",
        )

    current = await jobs.get(stored.id)
    assert current.status == "compiling"
    assert current.claim_token == claimed.claim_token


@pytest.mark.asyncio
async def test_worker_missing_input_fails_job() -> None:
    pool = _FakePool()
    jobs = CompileJobRepository(pool)  # type: ignore[arg-type]

    class _MissingRevisions(_StubRevisions):
        async def get_revision(self, resume_id: str, revision_id: str):  # type: ignore[no-untyped-def]
            from services.revisions import RevisionNotFoundError

            raise RevisionNotFoundError("gone")

    record = _record()
    worker = CompileWorker(
        pool,  # type: ignore[arg-type]
        jobs=jobs,
        revisions=_MissingRevisions(
            record_to_ir(record, source_document_hash="h")
        ),  # type: ignore[arg-type]
        compiler=ResumeCompiler(),
    )
    stored = await jobs.enqueue(**_enqueue_kwargs(max_attempts=1))
    [claimed] = await jobs.claim()
    done = await worker.process_job(claimed)
    assert done.status == "failed"
    assert "Missing compile input" in (done.last_error or "")
    _ = stored


# --- request path never runs a subprocess ---


def test_no_subprocess_in_request_handlers() -> None:
    root = Path(__file__).resolve().parent.parent / "apps" / "resume-agent"
    for name in ("routes/variants.py", "routes/compile_jobs.py", "routes/latex.py"):
        source = (root / name).read_text()
        assert "import subprocess" not in source, name
        assert "subprocess." not in source, name
        assert "compile_tex_source" not in source, name
        assert ".compile(" not in source, name


# --- job route ownership ---


def _stub_app():
    """Real compile-jobs router backed by stub app state."""
    from types import SimpleNamespace

    from routes.compile_jobs import router
    from services.compile_jobs import JobNotFoundError

    app = FastAPI()

    class _Repo:
        def __init__(self, user_id: str | None) -> None:
            self._user_id = user_id

        async def get(self, resume_id: str):
            if self._user_id is None:
                from services.db import ResumeNotFoundError

                raise ResumeNotFoundError("missing")
            record = _record()
            record.user_id = self._user_id
            return record

    class _Jobs:
        async def get(self, job_id: str) -> CompileJob:
            if job_id == "missing":
                raise JobNotFoundError("Compile job missing not found")
            return _worker_job(id=job_id)

    app.include_router(router)
    app.state.app_state = SimpleNamespace(
        repository=_Repo("compile-job-user"),
        compile_job_repository=_Jobs(),
        revision_repository=None,
    )
    return app


def test_job_route_requires_owner() -> None:
    client = TestClient(_stub_app(), raise_server_exceptions=False)
    assert client.get("/compile-jobs/job-1").status_code == 401
    assert (
        client.get("/compile-jobs/job-1", headers={"X-User-Id": "intruder"}).status_code
        == 403
    )
    ok = client.get(
        "/compile-jobs/job-1", headers={"X-User-Id": "compile-job-user"}
    )
    assert ok.status_code == 200
    assert ok.json()["job"]["id"] == "job-1"
    assert (
        client.get(
            "/compile-jobs/missing", headers={"X-User-Id": "compile-job-user"}
        ).status_code
        == 404
    )
    # Queued job has no PDF yet.
    pending = client.get(
        "/compile-jobs/job-1/pdf", headers={"X-User-Id": "compile-job-user"}
    )
    assert pending.status_code == 409


def test_patch_build_still_gates_worker_inputs() -> None:
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    target = _content(record)
    target.skills = ["Python", "PostgreSQL", "InventedSkill"]
    with pytest.raises(ValueError, match="unsupported skills"):
        build_patch(
            ir=ir,
            target=target,
            source_revision_id="revision-1",
            job_profile={"title": "Backend Engineer"},
        )


def test_job_models_validate() -> None:
    from models import CompileEnqueueResponse, CompileJobResponse

    enqueue = CompileEnqueueResponse(
        job_id="job-1", status="queued", resume_id="resume-1", variant_id="v"
    )
    assert enqueue.kind == "preview"
    job = _worker_job()
    response = CompileJobResponse(job=job, artifact=None, pdf_url=None)
    assert response.job.id == "job-1"
    assert DiffContract().semantic == []
