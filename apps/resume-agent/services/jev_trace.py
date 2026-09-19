"""Best-effort trace logging for offline JEV evaluation."""

from __future__ import annotations

import json
import logging
from hashlib import sha256
from time import perf_counter

from models import ControlledTailoringProposal, JobProfile, ResumeIR
from services.ir import ir_hash, sha256_json

logger = logging.getLogger(__name__)

def log_resume_tailoring_trace(
    *,
    variant_id: str,
    ir: ResumeIR,
    job_profile: JobProfile,
    proposal: ControlledTailoringProposal,
    model: str,
    started_at: float,
) -> None:
    payload = {
        "event": "resume_tailor_trace",
        "variant_id": variant_id,
        "ir_hash": ir_hash(ir),
        "job_profile_hash": sha256_json(job_profile.model_dump(mode="json")),
        "proposal_hash": sha256_json(proposal.model_dump(mode="json")),
        "proposal_summary": {
            "operation_count": len(proposal.operations),
            "operations": [
                {
                    "operation": operation.operation,
                    "node_id": operation.node_id,
                    "field": operation.field,
                    "evidence_ids": operation.evidence_ids,
                }
                for operation in proposal.operations
            ],
        },
        "model": model,
        "latency_ms": round((perf_counter() - started_at) * 1000, 2),
        "prompt_version": "resume-eval.v1",
    }
    logger.info("jev_trace %s", json.dumps(payload, separators=(",", ":")))


def should_sample_trace(trace_key: str, sample_rate: float) -> bool:
    if sample_rate <= 0:
        return False
    if sample_rate >= 1:
        return True
    bucket = int(sha256(trace_key.encode("utf-8")).hexdigest()[:8], 16)
    return bucket / 0xFFFFFFFF < sample_rate
