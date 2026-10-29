"""Cloudflare R2 object storage backend (S3-compatible) for resume artifacts.

Enabled only when R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are all
set; otherwise callers fall back to local-disk storage. boto3 is imported
lazily so local-only deployments never require it.

Endpoint: https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com (or R2_ENDPOINT_URL).
See docs/g2-r2-storage-runbook.md.
"""

from __future__ import annotations

import functools
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_REQUIRED_ENV = ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")


def enabled() -> bool:
    return all(os.environ.get(name, "").strip() for name in _REQUIRED_ENV)


def bucket_name() -> str:
    return os.environ["R2_BUCKET"].strip()


@functools.lru_cache(maxsize=1)
def _client() -> Any:
    import boto3
    from botocore.config import Config

    account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    endpoint = (
        os.environ.get("R2_ENDPOINT_URL", "").strip()
        or (f"https://{account_id}.r2.cloudflarestorage.com" if account_id else None)
    )
    if not endpoint:
        raise RuntimeError(
            "R2 endpoint is not configured: set R2_ACCOUNT_ID or R2_ENDPOINT_URL"
        )
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"].strip(),
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"].strip(),
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def reset_client_cache() -> None:
    """Drop the cached boto3 client (used by tests after env changes)."""

    _client.cache_clear()


def _is_missing(error: Exception) -> bool:
    response = getattr(error, "response", None)
    if not isinstance(response, dict):
        return False
    code = str(response.get("Error", {}).get("Code", ""))
    status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code in {"NoSuchKey", "NotFound", "404"} or status == 404


def put_bytes(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(
        Bucket=bucket_name(), Key=key, Body=data, ContentType=content_type
    )


def head_object(key: str) -> bool:
    try:
        _client().head_object(Bucket=bucket_name(), Key=key)
        return True
    except Exception as error:
        if _is_missing(error):
            return False
        logger.warning("R2 head_object failed for %s: %s", key, error)
        return False


def get_bytes(key: str) -> bytes | None:
    try:
        response = _client().get_object(Bucket=bucket_name(), Key=key)
        body = response["Body"].read()
        if isinstance(body, bytes):
            return body
        return bytes(body)
    except Exception as error:
        if _is_missing(error):
            return None
        logger.warning("R2 get_object failed for %s: %s", key, error)
        return None


def delete_prefix(prefix: str) -> int:
    deleted = 0
    paginator = _client().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket_name(), Prefix=prefix):
        contents = page.get("Contents", [])
        if not contents:
            continue
        objects = [{"Key": item["Key"]} for item in contents]
        _client().delete_objects(
            Bucket=bucket_name(), Delete={"Objects": objects, "Quiet": True}
        )
        deleted += len(objects)
    return deleted
