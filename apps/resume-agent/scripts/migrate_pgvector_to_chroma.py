#!/usr/bin/env python3
"""
Migration: PGVector (langchain-postgres + pgvector) → Chroma Cloud

- Reads resumes from Postgres `resumes` table (raw_text + user_id)
- Chunks with same logic as services/rag/chunker.py (16 KiB + line-based)
- Ingests into Chroma Cloud sharded per user (get_or_create_collection)
  using Schema: dense Qwen (Chroma Cloud Qwen) + sparse Splade + RRF
- Deduplicates via GroupBy metadata (resume_id + chunk_idx)

Usage:
  # Set env first (or .env)
  export DATABASE_URL=postgresql://...
  export CHROMA_HOST=api.trychroma.com
  export CHROMA_API_KEY=...
  export CHROMA_TENANT=828b3d75-ec86-473f-95e8-31eafdc924d6
  export CHROMA_DATABASE=applyos-vectordb

  cd apps/resume-agent && uv run python scripts/migrate_pgvector_to_chroma.py --dry-run
  cd apps/resume-agent && uv run python scripts/migrate_pgvector_to_chroma.py --execute

For existing projects, this copies and re-embeds data via Chroma Cloud server-side
embeddings (no local model needed). Sparse + dense are generated server-side per Schema.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

# Ensure config loads from apps/resume-agent/.env
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncpg  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def fetch_resumes(pool: asyncpg.Pool):
    rows = await pool.fetch(
        """
        SELECT id::text as resume_id, user_id, raw_text, file_name
        FROM resumes
        WHERE raw_text IS NOT NULL AND length(raw_text) > 0
        ORDER BY created_at
        """
    )
    return rows


async def migrate(dry_run: bool = True, limit: int | None = None):
    from config import settings
    from services.rag.chroma_store import ChromaResumeStore

    # Check Chroma config
    if not settings.chroma_api_key:
        logger.error("CHROMA_API_KEY not set — set from https://www.trychroma.com/akashlaha48/aws-us-east-1/applyos-vectordb/sdk?tab=env")
        sys.exit(1)

    logger.info(
        "Chroma target: host=%s tenant=%s database=%s prefix=%s shard_by_user=%s",
        settings.chroma_host,
        settings.chroma_tenant,
        settings.chroma_database,
        settings.chroma_collection_prefix,
        settings.chroma_shard_by_user,
    )

    # Init Chroma store (will create Schema with Qwen + Splade)
    try:
        chroma = ChromaResumeStore()
        client = chroma._require_client()
        logger.info("Chroma client OK — heartbeat passed")
    except Exception as exc:
        logger.error("Chroma init failed: %s", exc)
        sys.exit(1)

    # Connect Postgres (source)
    pool = await asyncpg.create_pool(dsn=settings.database_url, min_size=1, max_size=2)
    rows = await fetch_resumes(pool)
    if limit:
        rows = rows[:limit]
    logger.info("Found %d resumes with raw_text in Postgres", len(rows))
    if not rows:
        logger.info("Nothing to migrate")
        await pool.close()
        return

    # Group by user for sharding stats
    from collections import Counter

    user_counts = Counter(r["user_id"] for r in rows)
    logger.info("Users to shard: %d (top: %s)", len(user_counts), user_counts.most_common(5))

    if dry_run:
        logger.info("DRY RUN — would ingest %d resumes across %d collections. Use --execute to run.", len(rows), len(user_counts))
        for r in rows[:5]:
            logger.info("  would ingest resume=%s user=%s file=%s chars=%d", r["resume_id"], r["user_id"], r["file_name"], len(r["raw_text"] or ""))
        await pool.close()
        return

    # Execute migration
    total_chunks = 0
    failed = 0
    for idx, row in enumerate(rows, 1):
        resume_id = row["resume_id"]
        user_id = row["user_id"]
        raw_text = row["raw_text"]
        file_name = row["file_name"]
        try:
            n = await chroma.aadd_resume_chunks(
                resume_id=resume_id,
                raw_text=raw_text,
                user_id=user_id,
                file_name=file_name,
                source_document_hash=None,
                ir_revision_id=None,
            )
            total_chunks += n
            logger.info("[%d/%d] migrated resume=%s user=%s chunks=%d", idx, len(rows), resume_id, user_id, n)
        except Exception as exc:
            failed += 1
            logger.error("Failed resume %s: %s", resume_id, exc)

    logger.info("Migration complete: %d resumes, %d chunks, %d failed", len(rows), total_chunks, failed)

    # Verify a sample search per user (hybrid RRF + GroupBy)
    if rows:
        sample_user = rows[0]["user_id"]
        try:
            docs = await chroma.ahybrid_search(query="software engineer experience", user_id=sample_user, k=3)
            logger.info("Verification search for user %s: %d docs", sample_user, len(docs))
            for d in docs[:3]:
                logger.info("  doc preview: %s ...", d.page_content[:120].replace("\n", " "))
        except Exception as exc:
            logger.warning("Verification search failed: %s", exc)

    await pool.close()


def main():
    parser = argparse.ArgumentParser(description="Migrate PGVector resumes to Chroma Cloud")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Simulate without writing")
    parser.add_argument("--execute", action="store_true", help="Actually write to Chroma")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of resumes for test")
    args = parser.parse_args()

    dry_run = not args.execute
    if args.dry_run and args.execute:
        dry_run = False

    asyncio.run(migrate(dry_run=dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
