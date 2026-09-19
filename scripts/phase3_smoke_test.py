#!/usr/bin/env python3
"""Phase 3 end-to-end smoke: resume.pdf → tailor → compile → apply."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
RESUME_PATH = ROOT / "resume.pdf"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_dotenv(ROOT / "apps" / "api" / ".env")

API_URL = os.environ.get("API_URL", "http://localhost:3333")
ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://127.0.0.1:8001")
APPLY_AGENT_URL = os.environ.get("APPLY_AGENT_URL", "http://127.0.0.1:8003")
RESUME_AGENT_URL = os.environ.get("RESUME_AGENT_URL", "http://127.0.0.1:8005")
TOKEN = os.environ.get("AGENT_SERVICE_TOKEN", "")
USER_ID = os.environ.get("SMOKE_USER_ID", "XjM4xmAtopiS6DrZicqkr91f2hLlNgK7")

SMOKE_JOB = {
    "dedup_key": f"phase3-smoke-{uuid.uuid4().hex[:8]}",
    "job_title": "Backend Engineer, Geo Team",
    "company_name": "GitLab",
    "job_description": "Python PostgreSQL distributed systems backend engineer remote",
    "application_url": "https://job-boards.greenhouse.io/gitlab/jobs/8620720002",
    "external_id": "8620720002",
    "ats_type": "greenhouse",
    "location": "Remote",
    "match_score": 85,
}


class SmokeFailure(Exception):
    pass


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def step(msg: str) -> None:
    print(f"\n==> {msg}")


def service_headers() -> dict[str, str]:
    return {"X-Agent-Service-Token": TOKEN}


def user_headers(user_id: str) -> dict[str, str]:
    return {"X-User-Id": user_id}


def check_services(client: httpx.Client) -> None:
    for name, url in [
        ("API", f"{API_URL}/"),
        ("Orchestrator", f"{ORCHESTRATOR_URL}/health"),
        ("Apply-agent", f"{APPLY_AGENT_URL}/health"),
        ("Resume-agent", f"{RESUME_AGENT_URL}/health"),
    ]:
        res = client.get(url, timeout=8.0)
        if res.status_code >= 500:
            raise SmokeFailure(f"{name} unhealthy ({res.status_code})")
    ok("All services reachable")


def parse_resume(client: httpx.Client, user_id: str) -> dict:
    if not RESUME_PATH.exists():
        raise SmokeFailure(f"Missing {RESUME_PATH}")
    with RESUME_PATH.open("rb") as handle:
        res = client.post(
            f"{RESUME_AGENT_URL}/parse",
            files={"file": (RESUME_PATH.name, handle, "application/pdf")},
            data={"user_id": user_id},
            headers=user_headers(user_id),
            timeout=180.0,
        )
    if res.status_code != 200:
        raise SmokeFailure(f"Parse failed ({res.status_code}): {res.text[:400]}")
    payload = res.json()
    ok(f"Parsed resume {payload.get('resume_id')} ({payload.get('full_name')})")
    return payload


def ensure_variant(client: httpx.Client, resume_id: str, user_id: str) -> dict:
    res = client.post(
        f"{RESUME_AGENT_URL}/resume/{resume_id}/variants/ensure",
        headers={**user_headers(user_id), "Content-Type": "application/json"},
        json={
            "jobs": [
                {
                    "dedup_key": SMOKE_JOB["dedup_key"],
                    "job_title": SMOKE_JOB["job_title"],
                    "company_name": SMOKE_JOB["company_name"],
                    "job_description": SMOKE_JOB["job_description"],
                    "initial_match_score": SMOKE_JOB["match_score"],
                }
            ]
        },
        timeout=120.0,
    )
    if res.status_code != 200:
        raise SmokeFailure(f"Ensure variants failed ({res.status_code}): {res.text[:400]}")
    variants = res.json().get("variants") or []
    if not variants:
        raise SmokeFailure("Ensure variants returned no variants")
    variant = variants[0]
    if variant.get("status") != "draft":
        raise SmokeFailure(f"Expected draft status, got {variant.get('status')}")
    if not variant.get("patch_id"):
        raise SmokeFailure("Draft variant is missing approved patch_id")
    ok(f"Draft variant {variant['id']} has patch {variant['patch_id']}")
    return variant


def poll_compile(
    client: httpx.Client,
    resume_id: str,
    job_id: str,
    user_id: str,
    timeout_sec: int = 90,
) -> dict:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        res = client.get(
            f"{RESUME_AGENT_URL}/compile-jobs/{job_id}",
            headers=user_headers(user_id),
            timeout=15.0,
        )
        if res.status_code != 200:
            time.sleep(1.5)
            continue
        payload = res.json()
        job = payload.get("job") or {}
        status = job.get("status")
        if status == "ready":
            ok(f"Compile job {job_id} ready")
            return payload
        if status == "failed":
            raise SmokeFailure(job.get("last_error") or "Compile failed")
        time.sleep(1.5)
    raise SmokeFailure(f"Compile job {job_id} timed out")


def compile_variant(
    client: httpx.Client,
    resume_id: str,
    variant_id: str,
    user_id: str,
    kind: str,
) -> dict:
    res = client.post(
        f"{RESUME_AGENT_URL}/resume/{resume_id}/variants/{variant_id}/{kind}",
        headers={**user_headers(user_id), "Content-Type": "application/json"},
        json={"source_mode": "structured"},
        timeout=60.0,
    )
    if res.status_code == 200:
        payload = res.json()
        variant = payload.get("variant") or payload
        if variant.get("artifact_id"):
            ok(f"{kind} cache hit with artifact {variant['artifact_id']}")
            return variant
    if res.status_code != 202:
        raise SmokeFailure(f"{kind} failed ({res.status_code}): {res.text[:400]}")
    job_id = res.json().get("job_id")
    if not isinstance(job_id, str):
        raise SmokeFailure(f"{kind} returned no job_id")
    poll_compile(client, resume_id, job_id, user_id)
    variant_res = client.get(
        f"{RESUME_AGENT_URL}/resume/{resume_id}/variants/{variant_id}",
        headers=user_headers(user_id),
        timeout=15.0,
    )
    if variant_res.status_code != 200:
        raise SmokeFailure("Could not reload variant after compile")
    variant = variant_res.json()
    if not variant.get("artifact_id"):
        raise SmokeFailure(f"{kind} finished without artifact_id")
    pdf_res = client.get(
        f"{RESUME_AGENT_URL}/resume/{resume_id}/variants/{variant_id}/pdf",
        headers=user_headers(user_id),
        timeout=30.0,
    )
    if pdf_res.status_code != 200 or len(pdf_res.content) < 100:
        raise SmokeFailure("PDF download failed or empty")
    ok(f"{kind} PDF downloaded ({len(pdf_res.content)} bytes)")
    return variant


def reject_variant(
    client: httpx.Client,
    resume_id: str,
    variant_id: str,
    user_id: str,
) -> dict:
    res = client.post(
        f"{RESUME_AGENT_URL}/resume/{resume_id}/variants/{variant_id}/reject",
        headers=user_headers(user_id),
        timeout=60.0,
    )
    if res.status_code != 200:
        raise SmokeFailure(f"Reject failed ({res.status_code}): {res.text[:400]}")
    variant = res.json()
    if variant.get("status") != "draft":
        raise SmokeFailure("Reject did not return draft status")
    if not variant.get("patch_id"):
        raise SmokeFailure("Reject did not create a new patch")
    ok(f"Reject created new patch {variant['patch_id']}")
    return variant


def build_cv(resume: dict, resume_id: str, artifact_hash: str | None = None) -> dict:
    resume_url = (
        f"{RESUME_AGENT_URL}/internal/artifacts/{artifact_hash}"
        if artifact_hash
        else f"{RESUME_AGENT_URL}/internal/resumes/{resume_id}/source"
    )
    return {
        "full_name": resume.get("full_name") or "Test User",
        "email": resume.get("email") or "test@example.com",
        "phone": resume.get("phone"),
        "location": resume.get("location"),
        "summary": resume.get("summary"),
        "experience_years": resume.get("experience_years") or 0,
        "skills": resume.get("skills") or [],
        "education": resume.get("education") or [],
        "work_history": resume.get("work_history") or [],
        "resume_url": resume_url,
    }


def start_workflow(
    client: httpx.Client,
    user_id: str,
    resume_id: str,
    resume: dict,
    variant: dict,
) -> str:
    cv_data = build_cv(resume, resume_id, variant.get("artifact_id"))
    job = {
        "title": SMOKE_JOB["job_title"],
        "company_name": SMOKE_JOB["company_name"],
        "application_url": SMOKE_JOB["application_url"],
        "external_id": SMOKE_JOB["external_id"],
        "source": SMOKE_JOB["ats_type"],
        "department": SMOKE_JOB.get("department"),
        "location": SMOKE_JOB["location"],
        "description_raw": SMOKE_JOB["job_description"],
        "dedup_key": SMOKE_JOB["dedup_key"],
        "match_score": SMOKE_JOB["match_score"],
        "resume_variant_id": variant["id"],
        "cv_data": cv_data,
    }
    workflow_payload = {
        "user_profile": {
            "user_id": user_id,
            "preferred_role": resume.get("preferred_role") or "Software Engineer",
            "years_experience": resume.get("experience_years") or 0,
            "preferred_locations": resume.get("preferred_locations") or [],
        },
        "cv_data": cv_data,
        "jobs": [job],
        "max_jobs_per_company": 1,
        "max_total_applies": 1,
        "auto_apply": True,
        "auto_submit": False,
        "post_apply_linkedin_connect": False,
    }
    durable_res = client.post(
        f"{API_URL}/v1/workflows/internal/start",
        headers={**service_headers(), "Content-Type": "application/json"},
        json={
            "userId": user_id,
            "resumeId": resume_id,
            "request": workflow_payload,
            "applications": [
                {
                    "dedupKey": SMOKE_JOB["dedup_key"],
                    "title": SMOKE_JOB["job_title"],
                    "companyName": SMOKE_JOB["company_name"],
                    "applicationUrl": SMOKE_JOB["application_url"],
                    "externalId": SMOKE_JOB["external_id"],
                    "source": SMOKE_JOB["ats_type"],
                    "location": SMOKE_JOB["location"],
                    "matchScore": SMOKE_JOB["match_score"],
                    "resumeVariantId": variant["id"],
                }
            ],
        },
        timeout=30.0,
    )
    if durable_res.status_code not in {200, 201}:
        raise SmokeFailure(
            f"Workflow start failed ({durable_res.status_code}): {durable_res.text[:400]}"
        )
    workflow_id = durable_res.json().get("workflowId")
    if not isinstance(workflow_id, str):
        raise SmokeFailure("Workflow start returned no workflowId")

    orch_res = client.post(
        f"{ORCHESTRATOR_URL}/workflows",
        headers={**service_headers(), "Content-Type": "application/json"},
        json={**workflow_payload, "workflow_id": workflow_id},
        timeout=30.0,
    )
    if orch_res.status_code not in {200, 202}:
        raise SmokeFailure(
            f"Orchestrator start failed ({orch_res.status_code}): {orch_res.text[:400]}"
        )
    ok(f"Workflow {workflow_id} queued with tailored variant")
    return workflow_id


def wait_for_application(
    client: httpx.Client,
    user_id: str,
    workflow_id: str,
    timeout_sec: int = 120,
) -> dict:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        res = client.get(
            f"{API_URL}/v1/applications/internal/user/{user_id}",
            headers=service_headers(),
            timeout=15.0,
        )
        if res.status_code == 200:
            for app in res.json().get("applications") or []:
                if app.get("workflowRunId") == workflow_id:
                    ok(f"Application {app.get('id')} status={app.get('status')}")
                    return app
        time.sleep(3)
    raise SmokeFailure("Application row not found for workflow")


def wait_for_hitl_or_terminal(
    client: httpx.Client,
    user_id: str,
    workflow_id: str,
    timeout_sec: int = 180,
) -> dict:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        app_res = client.get(
            f"{API_URL}/v1/applications/internal/user/{user_id}",
            headers=service_headers(),
            timeout=15.0,
        )
        if app_res.status_code == 200:
            for app in app_res.json().get("applications") or []:
                if app.get("workflowRunId") != workflow_id:
                    continue
                if app.get("status") == "waiting_for_human":
                    ok(
                        f"Application {app.get('id')} reached waiting_for_human (HITL path)"
                    )
                    return {"application": app}

        res = client.get(f"{ORCHESTRATOR_URL}/workflows/{workflow_id}", timeout=15.0)
        if res.status_code == 200:
            data = res.json()
            tasks = data.get("apply_tasks") or []
            statuses = [t.get("status") for t in tasks]
            if any(status == "waiting_for_human" for status in statuses):
                ok("Orchestrator apply task reached waiting_for_human")
                return data
            if data.get("status") in {"completed", "partial", "failed", "cancelled"}:
                ok(f"Workflow terminal: {data.get('status')} tasks={statuses}")
                return data
        time.sleep(5)
    raise SmokeFailure("Workflow did not reach HITL or terminal state")


def patch_outcome(
    client: httpx.Client,
    workflow_id: str,
) -> None:
    res = client.patch(
        f"{API_URL}/v1/workflows/internal/{workflow_id}/applications/outcome",
        headers={**service_headers(), "Content-Type": "application/json"},
        json={
            "jobId": f"{workflow_id}:{SMOKE_JOB['dedup_key']}",
            "outcome": "viewed",
        },
        timeout=15.0,
    )
    if res.status_code != 200:
        raise SmokeFailure(f"Outcome patch failed ({res.status_code}): {res.text[:200]}")
    ok("Outcome patched to viewed")


def main() -> None:
    if not TOKEN:
        print("FAIL: AGENT_SERVICE_TOKEN is required", file=sys.stderr)
        sys.exit(1)

    results: dict[str, bool] = {}
    try:
        with httpx.Client() as client:
            step("Service health")
            check_services(client)
            results["services"] = True

            step("Parse resume.pdf")
            parsed = parse_resume(client, USER_ID)
            resume_id = parsed["resume_id"]
            resume = client.get(
                f"{RESUME_AGENT_URL}/resume/{resume_id}",
                headers=user_headers(USER_ID),
                timeout=15.0,
            ).json()
            results["parse"] = True

            step("Ensure draft + approved patch")
            variant = ensure_variant(client, resume_id, USER_ID)
            results["draft_patch"] = True

            step("Preview compile → PDF")
            preview_variant = compile_variant(
                client, resume_id, variant["id"], USER_ID, "preview"
            )
            results["preview_pdf"] = True

            step("Reject → new patch")
            rejected = reject_variant(client, resume_id, preview_variant["id"], USER_ID)
            results["reject"] = True

            step("Approve (finalize) → ready PDF")
            ready_variant = compile_variant(
                client, resume_id, rejected["id"], USER_ID, "finalize"
            )
            if ready_variant.get("status") != "ready":
                raise SmokeFailure(f"Finalize expected ready, got {ready_variant.get('status')}")
            results["approve_pdf"] = True

            step("Start durable workflow with tailored variant")
            workflow_id = start_workflow(client, USER_ID, resume_id, resume, ready_variant)
            results["workflow_start"] = True

            step("Verify Application(pending)")
            app = wait_for_application(client, USER_ID, workflow_id)
            if app.get("status") not in {
                "pending",
                "queued",
                "starting",
                "running",
                "waiting_for_human",
                "resuming",
            }:
                raise SmokeFailure(f"Unexpected initial application status: {app.get('status')}")
            results["application_pending"] = True

            step("Wait for HITL or terminal apply state")
            wait_for_hitl_or_terminal(client, USER_ID, workflow_id)
            results["hitl_or_terminal"] = True

            step("Patch application outcome")
            patch_outcome(client, workflow_id)
            results["outcome"] = True

    except SmokeFailure as exc:
        print(f"\nFAIL: {exc}", file=sys.stderr)
        print("\nResults:", json.dumps(results, indent=2))
        sys.exit(1)

    print("\n=== Phase 3 smoke PASSED ===")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
