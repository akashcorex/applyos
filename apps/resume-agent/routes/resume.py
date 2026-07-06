"""Resume ingestion + retrieval + job matching + RAG chat/improve routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from dependencies import AppState
from models import (
    ChatRequest,
    ChatResponse,
    ImproveRequest,
    ImproveResponse,
    MatchResponse,
    ParseResponse,
    ResumeRecord,
)
from services.db import ResumeNotFoundError
from services.extractor import LLMExtractor
from services.matcher import JobMatcher
from services.parser import ResumeParser, UnsupportedFileTypeError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["resume"])


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    return state


def _to_response(record: ResumeRecord, resume_id: str) -> ParseResponse:
    return ParseResponse(
        resume_id=resume_id,
        user_id=record.user_id,
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
        raw_text=record.raw_text,
        file_name=record.file_name,
        file_type=record.file_type,
    )


@router.post("/parse", response_model=ParseResponse, status_code=status.HTTP_200_OK)
async def parse_resume(
    request: Request,
    file: UploadFile = File(..., description="PDF or DOCX resume"),
    user_id: str = Form(..., min_length=1, max_length=128),
) -> ParseResponse:
    state = _state(request)
    parser: ResumeParser = state.parser or ResumeParser()
    extractor: LLMExtractor = state.extractor or LLMExtractor()

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        raw_text = parser.parse(file.filename or "resume", raw_bytes, file.content_type)
    except UnsupportedFileTypeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("Resume parse failed: %s", exc)
        raise HTTPException(status_code=422, detail=f"Could not parse file: {exc}") from exc

    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="No extractable text found in file")

    file_type = parser.detect_file_type(file.filename or "", file.content_type)
    try:
        record = await extractor.extract(
            raw_text=raw_text,
            user_id=user_id,
            file_name=file.filename,
            file_type=file_type,
        )
    except Exception as exc:
        logger.error("LLM extraction error: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM extraction failed: {exc}") from exc

    try:
        resume_id = await state.repository.insert(record)
    except Exception as exc:
        logger.error("Failed to persist resume: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to store resume") from exc

    if state.rag_pipeline is not None and record.raw_text:
        try:
            await state.rag_pipeline.ingest(
                resume_id=resume_id,
                raw_text=record.raw_text,
                user_id=user_id,
                file_name=file.filename,
            )
            logger.info("Resume %s ingested into RAG vector store", resume_id)
        except Exception as exc:
            logger.warning("RAG ingestion failed (non-fatal): %s", exc)

    return _to_response(record, resume_id)


@router.get("/resume/{resume_id}", response_model=ParseResponse)
async def get_resume(resume_id: str, request: Request) -> ParseResponse:
    state = _state(request)
    try:
        record = await state.repository.get(resume_id)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _to_response(record, resume_id)


@router.get("/resume/{resume_id}/match", response_model=MatchResponse)
async def match_resume(
    resume_id: str,
    request: Request,
    max_companies: int = 10,
    max_jobs: int = 50,
) -> MatchResponse:
    state = _state(request)
    matcher: JobMatcher | None = state.matcher
    if matcher is None:
        raise HTTPException(status_code=503, detail="matcher not initialised")

    try:
        record = await state.repository.get(resume_id)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return await matcher.match(
        resume=record,
        resume_id=resume_id,
        max_companies=max_companies,
        max_jobs=max_jobs,
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
            detail="RAG pipeline not available — configure OPENAI_API_KEY and pgvector",
        )

    try:
        await state.repository.get(resume_id)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    result = await state.rag_pipeline.chat(resume_id, payload.message)
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
            detail="RAG pipeline not available — configure OPENAI_API_KEY and pgvector",
        )

    try:
        await state.repository.get(resume_id)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    result = await state.rag_pipeline.improve(
        resume_id=resume_id,
        target_role=payload.target_role,
        job_description=payload.job_description,
    )
    return ImproveResponse(
        resume_id=resume_id,
        suggestions=result.get("suggestions", []),
        overall_assessment=result.get("overall_assessment", ""),
    )
