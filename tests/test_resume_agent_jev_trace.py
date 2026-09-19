from time import perf_counter

from models import (
    ControlledTailoringProposal,
    IRIdentity,
    JobProfile,
    ResumeIR,
    TailoringOperation,
)
from services.jev_trace import log_resume_tailoring_trace, should_sample_trace


def test_trace_logs_metadata_without_resume_text(caplog):
    ir = ResumeIR(
        user_id="user-1",
        source_document_hash="doc-1",
        identity=IRIdentity(full_name="Private Candidate"),
    )
    profile = JobProfile(title="Engineer", required_skills=["Python"])
    proposal = ControlledTailoringProposal(
        operations=[
            TailoringOperation(
                operation="rewrite_existing_bullet",
                node_id="bullet-1",
                field="text",
                before="Worked at Acme.",
                after="Worked at Acme and added a new metric.",
                evidence_ids=["evidence-1"],
            )
        ]
    )

    with caplog.at_level("INFO", logger="services.jev_trace"):
        log_resume_tailoring_trace(
            variant_id="variant-1",
            ir=ir,
            job_profile=profile,
            proposal=proposal,
            model="test-model",
            started_at=perf_counter(),
        )

    assert "Private Candidate" not in caplog.text
    assert "Worked at Acme" not in caplog.text
    assert "proposal_hash" in caplog.text
    assert "operation_count" in caplog.text


def test_trace_sampling_is_deterministic_and_bounded():
    assert should_sample_trace("variant-1", 0) is False
    assert should_sample_trace("variant-1", 1) is True
    assert should_sample_trace("variant-1", 0.5) == should_sample_trace(
        "variant-1", 0.5
    )
