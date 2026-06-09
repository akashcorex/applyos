"""Backward-compatible re-export — Nx serves via app.main:app."""

from app.main import app

__all__ = ["app"]
