from models import AtsType, CanonicalJob, ScrapeRequest, ScrapeResponse
from services.normalizer import to_canonical_job
from services.parsers.ashby import AshbyParser
from services.parsers.greenhouse import GreenhouseParser
from services.parsers.lever import LeverParser
from services.parsers.personio import PersonioParser
from services.parsers.recruitee import RecruiteeParser
from services.parsers.workable import WorkableParser

PARSERS = {
    "greenhouse": GreenhouseParser(),
    "lever": LeverParser(),
    "ashby": AshbyParser(),
    "workable": WorkableParser(),
    "recruitee": RecruiteeParser(),
    "personio": PersonioParser(),
}


async def scrape_jobs(ats_type: AtsType, payload: ScrapeRequest) -> ScrapeResponse:
    parser = PARSERS[ats_type]
    namespace = payload.company_id or payload.ats_slug
    raw_jobs = await parser.fetch_jobs(payload.ats_slug)

    canonical_jobs: list[CanonicalJob] = []
    seen_dedup_keys: set[str] = set()

    for raw_job in raw_jobs:
        canonical = to_canonical_job(raw_job, ats_type, namespace)
        if canonical.dedup_key in seen_dedup_keys:
            continue
        seen_dedup_keys.add(canonical.dedup_key)
        canonical_jobs.append(canonical)

    return ScrapeResponse(
        ats_type=ats_type,
        ats_slug=payload.ats_slug,
        company_id=namespace,
        jobs_found=len(canonical_jobs),
        jobs=canonical_jobs,
    )
