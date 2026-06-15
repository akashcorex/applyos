import logging

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def raise_bad_gateway(error: Exception, *, public_message: str) -> None:
    logger.exception(public_message)
    raise HTTPException(status_code=502, detail=public_message) from error
