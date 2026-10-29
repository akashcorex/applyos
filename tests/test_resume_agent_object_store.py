"""G2 durable storage tests — R2 backend selection, write-through, rehydration.

Hermetic: boto3 is never imported; the S3 client is faked. No database.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from services import object_store, storage


class FakeMissing(Exception):
    response = {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}}


class FakeBody:
    def __init__(self, data: bytes) -> None:
        self._data = data

    def read(self) -> bytes:
        return self._data


class FakeS3:
    def __init__(self) -> None:
        self.store: dict[str, tuple[bytes, str]] = {}
        self.puts: list[tuple[str, str, bytes, str]] = []
        self.deleted: list[str] = []

    def put_object(self, Bucket: str, Key: str, Body: bytes, ContentType: str) -> None:
        self.puts.append((Bucket, Key, Body, ContentType))
        self.store[Key] = (Body, ContentType)

    def head_object(self, Bucket: str, Key: str) -> dict[str, Any]:
        if Key not in self.store:
            raise FakeMissing()
        return {}

    def get_object(self, Bucket: str, Key: str) -> dict[str, Any]:
        if Key not in self.store:
            raise FakeMissing()
        return {"Body": FakeBody(self.store[Key][0])}

    def get_paginator(self, operation: str) -> Any:
        client = self

        class Paginator:
            def paginate(self, Bucket: str, Prefix: str) -> list[dict[str, Any]]:
                items = [{"Key": key} for key in client.store if key.startswith(Prefix)]
                return [{"Contents": items}] if items else []

        return Paginator()

    def delete_objects(self, Bucket: str, Delete: dict[str, Any]) -> dict[str, Any]:
        self.deleted.extend(obj["Key"] for obj in Delete["Objects"])
        return {}


@pytest.fixture()
def fake_s3(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> FakeS3:
    client = FakeS3()
    monkeypatch.setattr(object_store, "enabled", lambda: True)
    monkeypatch.setattr(object_store, "_client", lambda: client)
    monkeypatch.setenv("R2_BUCKET", "test-bucket")
    monkeypatch.setattr(storage, "_UPLOADS_ROOT", tmp_path)
    return client


@pytest.fixture()
def local_mode(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(object_store, "enabled", lambda: False)
    monkeypatch.setattr(storage, "_UPLOADS_ROOT", tmp_path)


def test_local_mode_writes_cache_only(local_mode: None, tmp_path: Path) -> None:
    path = storage.save_resume_file(
        user_id="u1",
        resume_id="r1",
        raw_bytes=b"pdf",
        file_name="resume.pdf",
        file_type="pdf",
    )
    assert Path(path).is_file()
    assert "resume-files/u1/r1.pdf" in path
    assert storage.resume_file_storage_key(
        user_id="u1", resume_id="r1", file_name=None, file_type="pdf"
    ).startswith("local://")


def test_r2_mode_writes_through(fake_s3: FakeS3) -> None:
    path = storage.save_resume_file(
        user_id="u1",
        resume_id="r1",
        raw_bytes=b"pdf-bytes",
        file_name=None,
        file_type="pdf",
    )
    assert Path(path).is_file()
    assert fake_s3.puts, "R2 put_object was not called"
    bucket, key, body, content_type = fake_s3.puts[0]
    assert bucket == "test-bucket"
    assert key == "resume-files/u1/r1.pdf"
    assert body == b"pdf-bytes"
    assert content_type == "application/pdf"
    assert storage.resume_file_storage_key(
        user_id="u1", resume_id="r1", file_name=None, file_type="pdf"
    ) == "r2://resume-files/u1/r1.pdf"


def test_resolve_artifact_rehydrates_from_r2(fake_s3: FakeS3, tmp_path: Path) -> None:
    storage.save_artifact_pdf(
        user_id="u1", artifact_hash="abc123", pdf_bytes=b"artifact-pdf"
    )
    cached = tmp_path / "artifacts" / "abc123.pdf"
    assert cached.is_file()
    cached.unlink()

    restored = storage.resolve_artifact_path(user_id="u1", artifact_hash="abc123")
    assert restored is not None
    assert Path(restored).read_bytes() == b"artifact-pdf"


def test_resolve_artifact_missing_everywhere(fake_s3: FakeS3) -> None:
    assert storage.resolve_artifact_path(user_id="u1", artifact_hash="nope") is None
    assert storage.find_artifact_path("nope") is None


def test_find_artifact_path_uses_flat_key(fake_s3: FakeS3, tmp_path: Path) -> None:
    fake_s3.store["artifacts/xyz.pdf"] = (b"shared-pdf", "application/pdf")
    path = storage.find_artifact_path("xyz")
    assert path is not None
    assert Path(path).read_bytes() == b"shared-pdf"


def test_legacy_local_layout_still_resolves(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(object_store, "enabled", lambda: False)
    monkeypatch.setattr(storage, "_UPLOADS_ROOT", tmp_path)
    legacy = tmp_path / "u1" / "artifacts"
    legacy.mkdir(parents=True)
    (legacy / "old.pdf").write_bytes(b"legacy")
    path = storage.resolve_artifact_path(user_id="u1", artifact_hash="old")
    assert path is not None
    assert Path(path).read_bytes() == b"legacy"

    legacy_tex = tmp_path / "u2" / "latex-sources"
    legacy_tex.mkdir(parents=True)
    (legacy_tex / "old.tex").write_bytes(b"legacy-tex")
    tex_path = storage.resolve_latex_source_path(user_id="u2", source_hash="old")
    assert tex_path is not None
    assert Path(tex_path).read_bytes() == b"legacy-tex"


def test_artifact_dedupe_skips_put_when_present(fake_s3: FakeS3, tmp_path: Path) -> None:
    fake_s3.store["artifacts/dup.pdf"] = (b"existing", "application/pdf")
    key, path = storage.save_artifact_pdf(
        user_id="u1", artifact_hash="dup", pdf_bytes=b"existing"
    )
    assert key == "r2://artifacts/dup.pdf"
    assert Path(path).read_bytes() == b"existing"
    assert fake_s3.puts == []


def test_ensure_resume_file_local_rehydrates(fake_s3: FakeS3) -> None:
    storage.save_resume_file(
        user_id="u2",
        resume_id="r9",
        raw_bytes=b"source-docx",
        file_name="cv.docx",
        file_type="docx",
    )
    dangling = "/nonexistent/container/uploads/u2/r9.docx"
    restored = storage.ensure_resume_file_local(
        user_id="u2", resume_id="r9", stored_path=dangling, file_type="docx"
    )
    assert restored is not None
    assert Path(restored).read_bytes() == b"source-docx"


def test_ensure_variant_pdf_local_rehydrates(fake_s3: FakeS3) -> None:
    storage.save_variant_pdf(user_id="u3", variant_id="v1", pdf_bytes=b"variant")
    restored = storage.ensure_variant_pdf_local(
        user_id="u3", variant_id="v1", stored_path="/gone/variants/v1.pdf"
    )
    assert restored is not None
    assert Path(restored).read_bytes() == b"variant"


def test_delete_user_objects_removes_only_user_scopes(fake_s3: FakeS3) -> None:
    storage.save_resume_file(
        user_id="u4", resume_id="r1", raw_bytes=b"a", file_name=None, file_type="pdf"
    )
    storage.save_variant_pdf(user_id="u4", variant_id="v1", pdf_bytes=b"b")
    storage.save_artifact_pdf(user_id="u4", artifact_hash="h1", pdf_bytes=b"c")

    storage.delete_user_objects("u4")

    assert sorted(fake_s3.deleted) == [
        "resume-files/u4/r1.pdf",
        "variant-pdfs/u4/v1.pdf",
    ]
    assert "artifacts/h1.pdf" in fake_s3.store
    user_cache = storage._UPLOADS_ROOT / "resume-files" / "u4"
    assert not any(user_cache.iterdir())


def test_save_latex_source_roundtrip(fake_s3: FakeS3, tmp_path: Path) -> None:
    key, path = storage.save_latex_source(
        user_id="u5", source_hash="hash1", tex_bytes=b"\\documentclass{article}"
    )
    assert key == "r2://latex-sources/hash1.tex"
    assert Path(path).read_bytes() == b"\\documentclass{article}"
    (tmp_path / "latex-sources" / "hash1.tex").unlink()
    restored = storage.resolve_latex_source_path(user_id="u5", source_hash="hash1")
    assert restored is not None
    assert Path(restored).read_bytes() == b"\\documentclass{article}"
