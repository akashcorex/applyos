"""Board registry CRUD and detect-to-upsert."""

from __future__ import annotations

from fastapi import APIRouter

from models import (
    GrowthRequest,
    GrowthResponse,
    RegistryBoard,
    RegistryFromDetectRequest,
    RegistryFromDetectResponse,
    RegistryListResponse,
    RegistryUpsertRequest,
)
from services.ats_detect import detect_ats
from services.board_registry import get_board_registry
from services.http_errors import raise_bad_gateway
from services.parsers.yc import extract_domain
from services.registry_growth import grow_registry

router = APIRouter()

_ATS_HOST_SUFFIXES = (
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "workable.com",
    "recruitee.com",
    "personio.de",
    "wellfound.com",
)


def _is_ats_host(domain: str) -> bool:
    return any(domain == suffix or domain.endswith(f".{suffix}") for suffix in _ATS_HOST_SUFFIXES)


def _resolve_domain(career_page_url: str, explicit_domain: str | None, slug: str) -> str:
    if explicit_domain:
        return explicit_domain.strip().lower()
    inferred = extract_domain(career_page_url)
    if inferred and not _is_ats_host(inferred):
        return inferred
    return f"{slug}.careers"


def _to_board_model(board: dict[str, object]) -> RegistryBoard:
    return RegistryBoard(
        name=str(board["name"]),
        domain=str(board["domain"]),
        ats_type=str(board["ats_type"]),
        ats_slug=str(board["ats_slug"]),
        career_url=board.get("career_url"),  # type: ignore[arg-type]
        source=str(board.get("source", "manual")),  # type: ignore[arg-type]
        active=bool(board.get("active", True)),
        last_verified_at=board.get("last_verified_at"),  # type: ignore[arg-type]
    )


@router.get("", response_model=RegistryListResponse)
async def list_registry_boards() -> RegistryListResponse:
    boards = get_board_registry().list_all_boards()
    return RegistryListResponse(
        total=len(boards),
        boards=[_to_board_model(board) for board in boards],
    )


@router.get("/refresh-status")
async def refresh_status() -> dict[str, object]:
    from config import settings

    registry = get_board_registry()
    return {
        "enabled": settings.refresh_enabled,
        "interval_seconds": settings.refresh_interval_seconds,
        "batch_boards": settings.refresh_batch_boards,
        "last_at": registry.get_meta_value("refresh_last_at"),
        "last_boards": registry.get_meta_value("refresh_last_boards"),
        "last_jobs": registry.get_meta_value("refresh_last_jobs"),
        "last_errors": registry.get_meta_value("refresh_last_errors"),
    }


@router.post("", response_model=RegistryBoard)
async def upsert_registry_board(payload: RegistryUpsertRequest) -> RegistryBoard:
    board = get_board_registry().upsert_board(
        domain=payload.domain.strip().lower(),
        company_name=payload.company_name,
        ats_type=payload.ats_type,
        ats_slug=payload.ats_slug,
        career_url=payload.career_url,
        source=payload.source,
        active=payload.active,
    )
    return _to_board_model(board)


@router.post("/from-detect", response_model=RegistryFromDetectResponse)
async def upsert_registry_from_detect(
    payload: RegistryFromDetectRequest,
) -> RegistryFromDetectResponse:
    try:
        ats_type, slug, confidence = await detect_ats(payload.career_page_url)
    except Exception as error:
        raise_bad_gateway(
            error,
            public_message="Failed to detect ATS from the provided URL",
        )

    detect = {
        "ats_type": ats_type,
        "suggested_slug": slug,
        "confidence": confidence,
        "career_page_url": payload.career_page_url,
    }
    from models import DetectResponse

    detect_response = DetectResponse.model_validate(detect)
    if not ats_type or not slug:
        return RegistryFromDetectResponse(detect=detect_response, board=None)

    domain = _resolve_domain(payload.career_page_url, payload.domain, slug)
    company_name = payload.company_name or slug.replace("-", " ").title()
    board = get_board_registry().upsert_board(
        domain=domain,
        company_name=company_name,
        ats_type=ats_type,
        ats_slug=slug,
        career_url=payload.career_page_url,
        source="detect",
    )
    return RegistryFromDetectResponse(
        detect=detect_response,
        board=_to_board_model(board),
    )


@router.post("/grow", response_model=GrowthResponse)
async def grow_registry_boards(payload: GrowthRequest) -> GrowthResponse:
    try:
        results = await grow_registry(
            [item.model_dump() for item in payload.companies],
            source=payload.source,
            verify=payload.verify,
            dry_run=payload.dry_run,
            concurrency=payload.concurrency,
        )
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to grow board registry")
        raise AssertionError("unreachable")
    counts = {"active": 0, "parked": 0, "skipped": 0, "failed": 0}
    for result in results:
        counts[result.status] += 1
    return GrowthResponse(
        total=len(results),
        added_active=counts["active"],
        parked=counts["parked"],
        skipped=counts["skipped"],
        failed=counts["failed"],
        results=results,
    )
