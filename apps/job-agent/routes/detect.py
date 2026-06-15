from fastapi import APIRouter

from models import DetectRequest, DetectResponse
from services.ats_detect import detect_ats
from services.http_errors import raise_bad_gateway

router = APIRouter()


@router.post("/detect", response_model=DetectResponse)
async def detect(payload: DetectRequest) -> DetectResponse:
    try:
        ats_type, slug, confidence = await detect_ats(payload.career_page_url)
        return DetectResponse(
            ats_type=ats_type,
            suggested_slug=slug,
            confidence=confidence,
            career_page_url=payload.career_page_url,
        )
    except Exception as error:
        raise_bad_gateway(
            error,
            public_message="Failed to detect ATS from the provided URL",
        )
