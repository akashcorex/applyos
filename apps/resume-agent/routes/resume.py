"""Resume ingestion + retrieval + job matching + RAG chat/improve routes."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse

from config import settings
from dependencies import AppState
from models import (
    ChatRequest,
    ChatResponse,
    ImproveRequest,
    ImproveResponse,
    MatchedJob,
    MatchResponse,
    ParseResponse,
    ResumeRecord,
)
from services.authz import (
    require_resume_owner,
    require_service_token,
    user_id_from_request,
)
from services.extractor import LLMExtractor
from services.matching import (
    JobMatcher,
    MatchSessionService,
    cached_embedding_valid,
    compute_profile_embedding,
)
from services.latex_safety import MAX_TEX_BYTES
from services.parser import (
    TEX_CONTENT_TYPES,
    ResumeParser,
    UnsupportedFileTypeError,
)
from services.ir import ir_to_record, record_to_ir, sha256_bytes
from services.db import ResumeNotFoundError
from services.storage import (
    ensure_resume_file_local,
    find_artifact_path,
    resume_file_storage_key,
    save_resume_file,
)
from services.tex_parser import TEX_PARSER_VERSION

logger = logging.getLogger(__name__)

router = APIRouter(tags=["resume"])


async def _read_resume_upload(file: UploadFile) -> bytes:
    is_tex = (file.filename or "").lower().endswith(".tex") or (
        file.content_type in TEX_CONTENT_TYPES
    )
    if not is_tex:
        return await file.read()
    raw_bytes = await file.read(MAX_TEX_BYTES + 1)
    if len(raw_bytes) > MAX_TEX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"LaTeX source exceeds the {MAX_TEX_BYTES}-byte limit",
        )
    return raw_bytes


def _media_type_for(file_type: str | None) -> str:
    if file_type == "docx":
        return (
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        )
    if file_type == "tex":
        return "application/x-tex"
    return "application/pdf"


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    return state


@router.get("/internal/artifacts/{artifact_hash}")
async def download_internal_artifact(
    artifact_hash: str,
    request: Request,
) -> FileResponse:
    """Serve an artifact only to trusted apply/orchestration workers."""

    require_service_token(request)
    path = find_artifact_path(artifact_hash)
    if not path:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"resume-{artifact_hash}.pdf",
    )


def _to_response(
    record: ResumeRecord,
    resume_id: str,
    *,
    ir_revision_id: str | None = None,
    source_document_hash: str | None = None,
) -> ParseResponse:
    return ParseResponse(
        resume_id=resume_id,
        user_id=record.user_id,
        ir_revision_id=ir_revision_id,
        source_document_hash=source_document_hash,
        source_document_url=f"/resume/{resume_id}/source",
        full_name=record.full_name,
        email=record.email,
        phone=record.phone,
        location=record.location,
        summary=record.summary,
        experience_years=record.experience_years,
        skills=record.skills,
        education=record.education,
        work_history=record.work_history,
        preferred_role=record.preferred_role,
        preferred_locations=record.preferred_locations,
        # Raw source text remains available to the internal IR pipeline but is
        # not returned to browser clients by default.
        raw_text=None,
        file_name=record.file_name,
        file_type=record.file_type,
    )


def _fail_code_for(exc: HTTPException) -> str:
    detail = str(exc.detail)
    if exc.status_code == 400:
        return "EMPTY_FILE"
    if exc.status_code == 415:
        return "UNSUPPORTED_TYPE"
    if exc.status_code == 422 and "No extractable" in detail:
        return "NO_TEXT"
    if exc.status_code == 422:
        return "PARSE_FAILED"
    if exc.status_code == 502:
        return "EXTRACTION_FAILED"
    return "PROCESSING_FAILED"


def _extraction_payload(record: ResumeRecord) -> dict[str, Any]:
    return record.model_dump(
        mode="json",
        exclude={"profile_embedding", "raw_text", "profile_text_hash"},
    )


async def _callback_api(
    resume_file_id: str,
    *,
    complete: dict[str, Any] | None = None,
    fail: dict[str, Any] | None = None,
) -> None:
    token = settings.agent_service_token.strip()
    if not token:
        logger.error("AGENT_SERVICE_TOKEN missing; cannot callback API")
        raise HTTPException(status_code=500, detail="Service token is not configured")
    base = settings.api_url.rstrip("/")
    path = "complete" if complete is not None else "fail"
    url = f"{base}/v1/resumes/internal/{resume_file_id}/{path}"
    payload = complete if complete is not None else (fail or {})
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            json=payload,
            headers={"X-Agent-Service-Token": token},
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError:
            if response.status_code == 403:
                logger.error(
                    "API callback 403 from %s — set API_URL to the API origin "
                    "(local default is http://localhost:5000)",
                    url,
                )
            raise


async def _parse_and_extract(
    *,
    parser: ResumeParser,
    extractor: LLMExtractor,
    raw_bytes: bytes,
    file_name: str | None,
    content_type: str | None,
    user_id: str,
) -> tuple[ResumeRecord, Any, str]:
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        parsed_document = parser.parse_document(
            file_name or "resume", raw_bytes, content_type
        )
        raw_text = parsed_document.text
    except UnsupportedFileTypeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("Resume parse failed: %s", exc)
        raise HTTPException(status_code=422, detail=f"Could not parse file: {exc}") from exc

    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="No extractable text found in file")

    file_type = parser.detect_file_type(file_name or "", content_type)
    try:
        record = await extractor.extract(
            raw_text=raw_text,
            user_id=user_id,
            file_name=file_name,
            file_type=file_type,
        )
    except Exception as exc:
        logger.error("LLM extraction error: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM extraction failed: {exc}") from exc
    return record, parsed_document, file_type


async def _persist_parsed_resume(
    state: AppState,
    *,
    record: ResumeRecord,
    raw_bytes: bytes,
    user_id: str,
    file_name: str | None,
    file_type: str,
    parsed_document: Any,
    extractor: LLMExtractor,
) -> tuple[str, str | None, str]:
    if state.repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    try:
        resume_id = await state.repository.insert(record)
    except Exception as exc:
        logger.error("Failed to persist resume: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to store resume") from exc

    try:
        file_path = save_resume_file(
            user_id=user_id,
            resume_id=resume_id,
            raw_bytes=raw_bytes,
            file_name=file_name,
            file_type=file_type,
        )
        await state.repository.update_file_path(resume_id, file_path)
        record.file_path = file_path
    except Exception as exc:
        logger.error("Failed to store resume file: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to store resume file") from exc

    source_hash = sha256_bytes(raw_bytes)
    revision_id: str | None = None
    if state.revision_repository is not None:
        try:
            parser_version = (
                TEX_PARSER_VERSION if file_type == "tex" else "resume-parser.v1"
            )
            source_document_id = await state.revision_repository.create_source_document(
                resume_id=resume_id,
                user_id=user_id,
                file_name=file_name,
                file_type=file_type,
                storage_key=resume_file_storage_key(
                    user_id=user_id,
                    resume_id=resume_id,
                    file_name=file_name,
                    file_type=file_type,
                ),
                content_sha256=source_hash,
                byte_size=len(raw_bytes),
                parser_version=parser_version,
            )
            ir = record_to_ir(
                record,
                source_document_hash=source_hash,
                resume_id=resume_id,
                source_document_id=source_document_id,
                source_segments=parsed_document.segments,
            )
            revision_id = await state.revision_repository.create_ir_revision(
                resume_id=resume_id,
                source_document_id=source_document_id,
                ir=ir,
                extraction_model=settings.llm_model,
                prompt_version="resume-extract.v1",
                prompt_hash=extractor.prompt_hash(),
            )
        except Exception as exc:
            logger.error("Failed to persist canonical resume IR: %s", exc)
            raise HTTPException(
                status_code=500, detail="Failed to store canonical resume"
            ) from exc

    if state.rag_pipeline is not None and record.raw_text:
        try:
            await state.rag_pipeline.ingest(
                resume_id=resume_id,
                raw_text=record.raw_text,
                user_id=user_id,
                file_name=file_name,
                source_document_hash=source_hash,
                ir_revision_id=revision_id,
            )
            logger.info("Resume %s ingested into RAG vector store", resume_id)
        except Exception as exc:
            logger.warning("RAG ingestion failed (non-fatal): %s", exc)

    embed_result = await compute_profile_embedding(record)
    if embed_result is not None:
        vector, text_hash = embed_result
        try:
            await state.repository.update_profile_embedding(
                resume_id,
                vector,
                text_hash,
                revision_id=revision_id,
                model=settings.embedding_model,
            )
            record.profile_embedding = vector
            record.profile_text_hash = text_hash
        except Exception as exc:
            logger.warning("Profile embedding cache failed (non-fatal): %s", exc)

    return resume_id, revision_id, source_hash


@router.post("/parse", response_model=ParseResponse, status_code=status.HTTP_200_OK)
async def parse_resume(
    request: Request,
    file: UploadFile = File(..., description="PDF, DOCX, or TeX resume"),
    user_id: str = Form(..., min_length=1, max_length=128),
) -> ParseResponse:
    state = _state(request)
    caller = user_id_from_request(request)
    if caller is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if caller != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    parser: ResumeParser = state.parser or ResumeParser()
    extractor: LLMExtractor = state.extractor or LLMExtractor()

    raw_bytes = await _read_resume_upload(file)
    record, parsed_document, file_type = await _parse_and_extract(
        parser=parser,
        extractor=extractor,
        raw_bytes=raw_bytes,
        file_name=file.filename,
        content_type=file.content_type,
        user_id=user_id,
    )
    resume_id, revision_id, source_hash = await _persist_parsed_resume(
        state,
        record=record,
        raw_bytes=raw_bytes,
        user_id=user_id,
        file_name=file.filename,
        file_type=file_type,
        parsed_document=parsed_document,
        extractor=extractor,
    )
    return _to_response(
        record,
        resume_id,
        ir_revision_id=revision_id,
        source_document_hash=source_hash,
    )


@router.post("/internal/extract", status_code=status.HTTP_200_OK)
async def internal_extract(
    request: Request,
    file: UploadFile = File(..., description="PDF, DOCX, or TeX resume"),
    resume_file_id: str = Form(..., min_length=1, max_length=128),
    user_id: str = Form(..., min_length=1, max_length=128),
) -> dict[str, Any]:
    """Service-token extract path used by Express POST /v1/resumes/:id/process."""
    require_service_token(request)
    state = _state(request)
    parser: ResumeParser = state.parser or ResumeParser()
    extractor: LLMExtractor = state.extractor or LLMExtractor()
    raw_bytes = await _read_resume_upload(file)
    try:
        record, parsed_document, file_type = await _parse_and_extract(
            parser=parser,
            extractor=extractor,
            raw_bytes=raw_bytes,
            file_name=file.filename,
            content_type=file.content_type,
            user_id=user_id,
        )
        resume_id, _revision_id, _source_hash = await _persist_parsed_resume(
            state,
            record=record,
            raw_bytes=raw_bytes,
            user_id=user_id,
            file_name=file.filename,
            file_type=file_type,
            parsed_document=parsed_document,
            extractor=extractor,
        )
        await _callback_api(
            resume_file_id,
            complete={
                "extraction": _extraction_payload(record),
                "parserVersion": (
                    TEX_PARSER_VERSION if file_type == "tex" else "resume-parser.v1"
                ),
                "resumeId": resume_id,
            },
        )
        return {"ok": True, "resume_id": resume_id}
    except HTTPException as exc:
        try:
            await _callback_api(
                resume_file_id,
                fail={"code": _fail_code_for(exc), "message": str(exc.detail)},
            )
        except Exception as callback_exc:
            logger.error("Failed to report extract failure: %s", callback_exc)
        raise
    except Exception as exc:
        logger.error("Internal extract failed: %s", exc)
        try:
            await _callback_api(
                resume_file_id,
                fail={"code": "PROCESSING_FAILED", "message": str(exc)},
            )
        except Exception as callback_exc:
            logger.error("Failed to report extract failure: %s", callback_exc)
        raise HTTPException(status_code=500, detail="Internal extract failed") from exc


@router.get("/resume/{resume_id}", response_model=ParseResponse)
async def get_resume(resume_id: str, request: Request) -> ParseResponse:
    state = _state(request)
    record = await require_resume_owner(state.repository, resume_id, request)
    revision = (
        await state.revision_repository.ensure_revision_for_record(
            resume_id=resume_id,
            record=record,
        )
        if state.revision_repository is not None
        else None
    )
    if revision is not None:
        record = ir_to_record(revision[1], template=record)
    return _to_response(
        record,
        resume_id,
        ir_revision_id=revision[0] if revision else None,
        source_document_hash=revision[1].source_document_hash if revision else None,
    )


@router.get("/internal/resumes/{resume_id}/source")
async def download_internal_source_resume(
    resume_id: str, request: Request
) -> FileResponse:
    """Serve the uploaded original resume to trusted apply workers."""

    require_service_token(request)
    state = _state(request)
    try:
        record = await state.repository.get(resume_id)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    file_path = ensure_resume_file_local(
        user_id=record.user_id,
        resume_id=resume_id,
        stored_path=record.file_path,
        file_type=record.file_type,
    )
    if not file_path:
        raise HTTPException(status_code=404, detail="Source resume not found")
    media_type = _media_type_for(record.file_type)
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=record.file_name or f"resume-{resume_id}",
    )


@router.get("/resume/{resume_id}/source")
async def download_source_resume(resume_id: str, request: Request) -> FileResponse:
    state = _state(request)
    record = await require_resume_owner(state.repository, resume_id, request)
    file_path = ensure_resume_file_local(
        user_id=record.user_id,
        resume_id=resume_id,
        stored_path=record.file_path,
        file_type=record.file_type,
    )
    if not file_path:
        raise HTTPException(status_code=404, detail="Source resume not found")
    media_type = _media_type_for(record.file_type)
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=record.file_name or f"resume-{resume_id}",
        content_disposition_type="inline"
        if record.file_type in ("pdf", "tex")
        else "attachment",
    )


@router.get("/resume/{resume_id}/latest-artifact")
async def get_latest_artifact(resume_id: str, request: Request) -> dict[str, str]:
    state = _state(request)
    await require_resume_owner(state.repository, resume_id, request)
    if state.revision_repository is None:
        raise HTTPException(status_code=503, detail="artifact store not initialised")
    artifact = await state.revision_repository.get_latest_artifact(resume_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="No compiled resume artifact")
    return {
        "artifact_id": artifact.artifact_hash,
        "download_url": f"/internal/artifacts/{artifact.artifact_hash}",
        "source_revision_id": artifact.source_revision_id,
    }


@router.get("/resume/{resume_id}/match", response_model=MatchResponse)
async def match_resume(
    resume_id: str,
    request: Request,
    max_companies: int = 10,
    max_jobs: int = 50,
    intent: str | None = None,
    profile_role: str | None = None,
    profile_experience_years: int | None = None,
    profile_skills: str | None = None,
    profile_locations: str | None = None,
    profile_seniority: str | None = None,
    profile_work_mode: str | None = None,
    pack: str | None = None,
) -> MatchResponse:
    state = _state(request)
    matcher: JobMatcher | None = state.matcher
    if matcher is None:
        raise HTTPException(status_code=503, detail="matcher not initialised")

    record, intent_override = await _prepare_match_record(
        state,
        resume_id,
        request,
        intent=intent,
        profile_role=profile_role,
        profile_experience_years=profile_experience_years,
        profile_skills=profile_skills,
        profile_locations=profile_locations,
    )

    response, latency_ms = await matcher.match(
        resume=record,
        resume_id=resume_id,
        max_companies=max_companies,
        max_jobs=max_jobs,
        intent_override=intent_override,
        profile_seniority=profile_seniority,
        profile_work_mode=profile_work_mode,
        profile_locations=record.preferred_locations,
        pack=pack,
    )
    response.intent_override = intent_override

    session_service: MatchSessionService | None = state.match_sessions
    if session_service is not None:
        try:
            session_id = await session_service.record(
                user_id=record.user_id,
                resume_id=resume_id,
                response=response,
                query_role=(record.preferred_role or "").strip() or "Software Engineer",
                intent_override=intent_override,
                latency_ms=latency_ms,
            )
            response.session_id = session_id
            MatchSessionService.log_ranked_results(response, intent_override)
        except Exception as exc:
            logger.warning("Match session recording failed (non-fatal): %s", exc)

    return response


async def _prepare_match_record(
    state,
    resume_id: str,
    request: Request,
    *,
    intent: str | None,
    profile_role: str | None,
    profile_experience_years: int | None,
    profile_skills: str | None,
    profile_locations: str | None,
):
    record = await require_resume_owner(state.repository, resume_id, request)
    revision = (
        await state.revision_repository.ensure_revision_for_record(
            resume_id=resume_id,
            record=record,
        )
        if state.revision_repository is not None
        else None
    )
    if revision is not None:
        record = ir_to_record(revision[1], template=record)

    profile_update: dict[str, object] = {}
    if profile_role and profile_role.strip():
        profile_update["preferred_role"] = profile_role.strip()
    if profile_experience_years is not None:
        profile_update["experience_years"] = max(profile_experience_years, 0)
    if profile_skills is not None:
        profile_update["skills"] = [
            skill.strip() for skill in profile_skills.split(",") if skill.strip()
        ]
    if profile_locations is not None:
        profile_update["preferred_locations"] = [
            location.strip()
            for location in profile_locations.split(",")
            if location.strip()
        ]
    if profile_update:
        record = record.model_copy(update=profile_update)

    intent_override = (intent or "").strip() or None
    if not intent_override and record.last_match_intent:
        intent_override = record.last_match_intent.strip() or None

    if intent_override:
        try:
            await state.repository.update_last_match_intent(resume_id, intent_override)
            record.last_match_intent = intent_override
        except Exception as exc:
            logger.warning("Failed to persist match intent: %s", exc)
    elif intent is not None and intent.strip() == "":
        try:
            await state.repository.update_last_match_intent(resume_id, None)
            record.last_match_intent = None
        except Exception as exc:
            logger.warning("Failed to clear match intent: %s", exc)

    if not cached_embedding_valid(record, intent_override=intent_override):
        embed_result = await compute_profile_embedding(
            record, intent_override=intent_override
        )
        if embed_result is not None and not intent_override:
            vector, text_hash = embed_result
            try:
                await state.repository.update_profile_embedding(
                    resume_id,
                    vector,
                    text_hash,
                    revision_id=revision[0] if revision else None,
                    model=settings.embedding_model,
                )
                record.profile_embedding = vector
                record.profile_text_hash = text_hash
            except Exception as exc:
                logger.warning("Profile embedding refresh failed: %s", exc)

    return record, intent_override


@router.get("/resume/{resume_id}/match/stream")
async def match_stream_resume(
    resume_id: str,
    request: Request,
    max_companies: int = 10,
    max_jobs: int = 50,
    intent: str | None = None,
    profile_role: str | None = None,
    profile_experience_years: int | None = None,
    profile_skills: str | None = None,
    profile_locations: str | None = None,
    profile_seniority: str | None = None,
    profile_work_mode: str | None = None,
    pack: str | None = None,
) -> StreamingResponse:
    from services.matching.sse import format_sse

    state = _state(request)
    matcher: JobMatcher | None = state.matcher
    if matcher is None:
        raise HTTPException(status_code=503, detail="matcher not initialised")

    record, intent_override = await _prepare_match_record(
        state,
        resume_id,
        request,
        intent=intent,
        profile_role=profile_role,
        profile_experience_years=profile_experience_years,
        profile_skills=profile_skills,
        profile_locations=profile_locations,
    )

    async def generate():
        collected: list[MatchedJob] = []
        companies = 0
        async for frame in matcher.match_stream(
            resume=record,
            resume_id=resume_id,
            max_companies=max_companies,
            max_jobs=max_jobs,
            intent_override=intent_override,
            profile_seniority=profile_seniority,
            profile_work_mode=profile_work_mode,
            profile_locations=record.preferred_locations,
            pack=pack,
        ):
            if frame["event"] == "batch":
                collected.extend(
                    MatchedJob.model_validate(job)
                    for job in frame["data"].get("jobs", [])
                )
                companies += 1
            yield format_sse(frame["event"], frame["data"])
        session_service: MatchSessionService | None = state.match_sessions
        if session_service is not None and collected:
            try:
                collected.sort(key=lambda job: job.match_score, reverse=True)
                await session_service.record(
                    user_id=record.user_id,
                    resume_id=resume_id,
                    response=MatchResponse(
                        resume_id=resume_id,
                        preferred_role=record.preferred_role,
                        skills_used=sorted(
                            {s for job in collected for s in job.matched_skills},
                            key=str.lower,
                        ),
                        total_matches=len(collected),
                        jobs_scraped=len(collected),
                        companies_scraped=companies,
                        jobs=collected,
                    ),
                    query_role=(record.preferred_role or "").strip()
                    or "Software Engineer",
                    intent_override=intent_override,
                    latency_ms=0,
                )
            except Exception as exc:
                logger.warning("Match session recording failed (non-fatal): %s", exc)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/resume/{resume_id}/chat", response_model=ChatResponse)
async def chat_resume(
    resume_id: str,
    request: Request,
    payload: ChatRequest,
) -> ChatResponse:
    state = _state(request)
    if state.rag_pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="RAG pipeline not available — configure CHROMA_API_KEY (Chroma Cloud) or OPENAI_API_KEY+pgvector",
        )

    record = await require_resume_owner(state.repository, resume_id, request)

    result = await state.rag_pipeline.chat(resume_id, payload.message, user_id=record.user_id)
    return ChatResponse(
        resume_id=resume_id,
        answer=result["answer"],
        sources=result.get("sources", []),
        chunks_retrieved=result.get("chunks_retrieved", 0),
    )


@router.post("/resume/{resume_id}/improve", response_model=ImproveResponse)
async def improve_resume(
    resume_id: str,
    request: Request,
    payload: ImproveRequest,
) -> ImproveResponse:
    state = _state(request)
    if state.rag_pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="RAG pipeline not available — configure CHROMA_API_KEY (Chroma Cloud) or OPENAI_API_KEY+pgvector",
        )

    record = await require_resume_owner(state.repository, resume_id, request)

    result = await state.rag_pipeline.improve(
        resume_id=resume_id,
        target_role=payload.target_role,
        job_description=payload.job_description,
        profile_context=None,
        user_id=record.user_id,
    )
    return ImproveResponse(
        resume_id=resume_id,
        suggestions=result.get("suggestions", []),
        overall_assessment=result.get("overall_assessment", ""),
    )
