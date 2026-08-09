"""Backward-compatible re-export — turbo serves via app.main:app."""

from app.main import app

__all__ = ["app"]
