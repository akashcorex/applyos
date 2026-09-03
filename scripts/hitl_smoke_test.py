#!/usr/bin/env python3
"""End-to-end HITL apply smoke test using resume.pdf and service APIs."""

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

API_URL = os.environ.get("API_URL", "http://localhost:5000")
ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://127.0.0.1:8001")
APPLY_AGENT_URL = os.environ.get("APPLY_AGENT_URL", "http://127.0.0.1:8003")
RESUME_AGENT_URL = os.environ.get("RESUME_AGENT_URL", "http://127.0.0.1:8005")
TOKEN = os.environ.get("AGENT_SERVICE_TOKEN", "")
USER_ID = os.environ.get("SMOKE_USER_ID", "")

# Known Greenhouse jobs from prior local runs — stable for smoke testing.
SMOKE_JOBS = [
    {
        "title": "Backend Engineer, Geo Team",
        "company_name": "GitLab",
        "application_url": "https://job-boards.greenhouse.io/gitlab/jobs/8620720002",
        "dedup_key": f"smoke-gitlab-{uuid.uuid4().hex[:8]}",
        "external_id": "8620720002",
        "ats_type": "greenhouse",
        "location": "Remote",
        "match_score": 80,
    },
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def headers() -> dict[str, str]:
    return {"X-Agent-Service-Token": TOKEN}


def check_services(client: httpx.Client) -> None:
    for name, url in [
        ("API", f"{API_URL}/"),
        ("Orchestrator", f"{ORCHESTRATOR_URL}/health"),
        ("Apply-agent", f"{APPLY_AGENT_URL}/health"),
        ("Resume-agent", f"{RESUME_AGENT_URL}/health"),
    ]:
        try:
            res = client.get(url, timeout=5.0)
            if res.status_code >= 500:
                fail(f"{name} unhealthy at {url} ({res.status_code})")
        except httpx.HTTPError as exc:
            fail(f"{name} unreachable at {url}: {exc}")
    ok("All services reachable")


def resolve_user_id(client: httpx.Client) -> str:
    if USER_ID:
        return USER_ID
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        fail("Set SMOKE_USER_ID or DATABASE_URL in apps/api/.env")
    import subprocess

    script = (
        "import pg from 'pg';"
        f"const c=new pg.Client({{connectionString:{db_url!r}}});"
        "await c.connect();"
        "const r=await c.query("
        "'SELECT user_id FROM workflow_runs ORDER BY created_at DESC LIMIT 1'"
        ");"
        "console.log(r.rows[0]?.user_id||'');"
        "await c.end();"
    )
    try:
        out = subprocess.check_output(
            ["bun", "-e", script],
            cwd=ROOT,
            text=True,
            timeout=10,
        ).strip()
        if out:
            ok(f"Using workflow owner user_id={out}")
            return out
    except Exception as exc:
        fail(f"Could not resolve user id from database: {exc}")
    fail("Set SMOKE_USER_ID in environment")


def parse_resume(client: httpx.Client, user_id: str) -> dict:
    if not RESUME_PATH.exists():
        fail(f"Resume not found at {RESUME_PATH}")
    with RESUME_PATH.open("rb") as handle:
        files = {"file": (RESUME_PATH.name, handle, "application/pdf")}
        data = {"user_id": user_id}
        res = client.post(
            f"{RESUME_AGENT_URL}/parse",
            files=files,
            data=data,
            headers={"X-User-Id": user_id},
            timeout=120.0,
        )
    if res.status_code != 200:
        fail(f"Resume parse failed ({res.status_code}): {res.text[:300]}")
    payload = res.json()
    ok(f"Parsed resume id={payload.get('resume_id')} name={payload.get('full_name')}")
    return payload


def load_resume(client: httpx.Client, resume_id: str, user_id: str) -> dict:
    res = client.get(
        f"{RESUME_AGENT_URL}/resume/{resume_id}",
        headers={"X-User-Id": user_id},
        timeout=15.0,
    )
    if res.status_code != 200:
        fail(f"Load resume failed ({res.status_code})")
    return res.json()


def build_cv(resume: dict, resume_id: str) -> dict:
    url = f"{RESUME_AGENT_URL}/internal/resumes/{resume_id}/source"
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
        "resume_url": url,
    }


def start_workflow(
    client: httpx.Client,
    user_id: str,
    resume_id: str,
    resume: dict,
    jobs: list[dict],
) -> str:
    cv_data = build_cv(resume, resume_id)
    workflow_payload = {
        "user_profile": {
            "user_id": user_id,
            "preferred_role": resume.get("preferred_role") or "Software Engineer",
            "years_experience": resume.get("experience_years") or 0,
            "preferred_locations": resume.get("preferred_locations") or [],
        },
        "cv_data": cv_data,
        "jobs": [
            {
                **job,
                "description_raw": job.get("description"),
                "cv_data": cv_data,
            }
            for job in jobs
        ],
        "max_jobs_per_company": 1,
        "max_total_applies": len(jobs),
        "auto_apply": True,
        "auto_submit": os.environ.get("SMOKE_AUTO_SUBMIT", "false").lower() == "true",
        "post_apply_linkedin_connect": False,
    }
    durable_res = client.post(
        f"{API_URL}/v1/workflows/internal/start",
        headers={**headers(), "Content-Type": "application/json"},
        json={
            "userId": user_id,
            "resumeId": resume_id,
            "request": workflow_payload,
            "applications": [
                {
                    "dedupKey": job["dedup_key"],
                    "title": job["title"],
                    "companyName": job["company_name"],
                    "applicationUrl": job["application_url"],
                    "externalId": job.get("external_id"),
                    "source": job.get("ats_type"),
                    "location": job.get("location"),
                    "matchScore": job.get("match_score"),
                    "resumeVariantId": None,
                }
                for job in jobs
            ],
        },
        timeout=30.0,
    )
    if durable_res.status_code not in {200, 201}:
        fail(f"Durable workflow start failed ({durable_res.status_code}): {durable_res.text[:400]}")
    durable = durable_res.json()
    workflow_id = durable.get("workflowId")
    if not isinstance(workflow_id, str):
        fail(f"Invalid durable response: {durable}")

    orch_res = client.post(
        f"{ORCHESTRATOR_URL}/workflows",
        headers={**headers(), "Content-Type": "application/json"},
        json={**workflow_payload, "workflow_id": workflow_id},
        timeout=30.0,
    )
    if orch_res.status_code not in {200, 202}:
        fail(f"Orchestrator start failed ({orch_res.status_code}): {orch_res.text[:400]}")
    ok(f"Started workflow {workflow_id} with {len(jobs)} jobs")
    return workflow_id


def poll_for_submit_approval(
    client: httpx.Client,
    user_id: str,
    workflow_id: str,
    timeout_sec: int = 180,
) -> dict | None:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        res = client.get(
            f"{API_URL}/v1/applications/internal/user/{user_id}",
            headers=headers(),
            timeout=10.0,
        )
        if res.status_code == 200:
            apps = res.json().get("applications") or []
            for app in apps:
                if app.get("workflowRunId") != workflow_id:
                    continue
                if app.get("status") == "waiting_for_human":
                    ok(
                        f"Application {app.get('id')} waiting for approval — "
                        "open the tracker modal and click Approve & Submit"
                    )
                    return app
        time.sleep(5)
    return None


def poll_workflow(client: httpx.Client, workflow_id: str, timeout_sec: int = 180) -> dict:
    deadline = time.time() + timeout_sec
    last_status = None
    auto_submit = os.environ.get("SMOKE_AUTO_SUBMIT", "false").lower() == "true"
    while time.time() < deadline:
        res = client.get(f"{ORCHESTRATOR_URL}/workflows/{workflow_id}", timeout=10.0)
        if res.status_code != 200:
            time.sleep(3)
            continue
        data = res.json()
        status = data.get("status")
        tasks = data.get("apply_tasks") or []
        summary = ", ".join(f"{t.get('company_name')}: {t.get('status')}" for t in tasks)
        if status != last_status:
            print(f"  workflow={status} | {summary}")
            last_status = status
        if not auto_submit and any(t.get("status") == "waiting_for_human" for t in tasks):
            ok("Application is waiting for your approval — open the modal and click Approve & Submit")
            return data
        terminal = {"completed", "partial", "failed", "cancelled"}
        if status in terminal and all(
            t.get("status")
            in {
                "submitted",
                "failed",
                "captcha_blocked",
                "login_required",
                "already_applied",
                "cancelled",
                "skipped",
                "waiting_for_human",
            }
            for t in tasks
        ):
            return data
        if any(t.get("status") == "waiting_for_human" for t in tasks):
            ok("At least one application reached waiting_for_human — HITL path works")
            return data
        time.sleep(5)
    fail(f"Workflow {workflow_id} did not reach terminal state within {timeout_sec}s")


def main() -> None:
    if not TOKEN:
        fail("AGENT_SERVICE_TOKEN is required")

    with httpx.Client() as client:
        check_services(client)
        user_id = resolve_user_id(client)
        parsed = parse_resume(client, user_id)
        resume_id = parsed["resume_id"]
        resume = load_resume(client, resume_id, user_id)
        workflow_id = start_workflow(
            client, user_id, resume_id, resume, SMOKE_JOBS[:1]
        )
        auto_submit = os.environ.get("SMOKE_AUTO_SUBMIT", "false").lower() == "true"
        if not auto_submit:
            pending = poll_for_submit_approval(client, user_id, workflow_id)
            if pending is None:
                fail("Application never reached waiting_for_human for submit approval")
            print(json.dumps(pending, indent=2)[:2000])
            ok("Smoke test paused for manual approval in the dashboard")
            return
        result = poll_workflow(client, workflow_id)
        print(json.dumps(result, indent=2)[:4000])

        tasks = result.get("apply_tasks") or []
        statuses = [t.get("status") for t in tasks]
        if all(s == "failed" for s in statuses):
            errors = [t.get("error_detail") for t in tasks]
            fail(f"All applications failed: {errors}")
        ok(f"Smoke test finished with statuses: {statuses}")


if __name__ == "__main__":
    main()
