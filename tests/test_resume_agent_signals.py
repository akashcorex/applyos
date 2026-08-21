from __future__ import annotations

import pytest

from models import MatchedJob
from services.matching.rerank import BehaviorReranker
from services.matching.signals import (
    EventCounts,
    JobSignalStats,
    OutcomeCounts,
    blend_user_global_rates,
    compute_behavior_delta,
    compute_outcome_delta,
)


def test_blend_user_global_rates_cold_user_leans_global() -> None:
    user = EventCounts(impressions=2, clicks=1, applies=0, skips=0)
    global_ = EventCounts(impressions=100, clicks=10, applies=5, skips=20)

    click_r, apply_r, skip_r = blend_user_global_rates(user, global_)

    assert click_r > 0.05  # global click rate is 0.1
    assert click_r < 0.5  # not fully user-weighted yet


def test_compute_behavior_delta_apply_boosts() -> None:
    stats = JobSignalStats(
        dedup_key="stripe::1",
        user=EventCounts(impressions=10, clicks=4, applies=3, skips=1),
        global_=EventCounts(),
    )
    delta = compute_behavior_delta(stats)
    assert delta > 0
    assert delta <= 12.0


def test_compute_behavior_delta_skip_penalizes() -> None:
    stats = JobSignalStats(
        dedup_key="bad::1",
        user=EventCounts(impressions=20, clicks=0, applies=0, skips=18),
        global_=EventCounts(),
    )
    delta = compute_behavior_delta(stats)
    assert delta < 0


def test_compute_outcome_delta_offer_outweighs_clicks() -> None:
    stats = JobSignalStats(
        dedup_key="offer::1",
        outcomes=OutcomeCounts(offer=1),
    )
    delta = compute_outcome_delta(stats)
    assert delta >= 8.0
    assert compute_behavior_delta(stats) >= 8.0


def test_compute_outcome_delta_does_not_double_count_same_application() -> None:
    """Company stats include this job; subtract before applying company weight."""
    stats = JobSignalStats(
        dedup_key="acme::1",
        outcomes=OutcomeCounts(offer=1),
        company_outcomes=OutcomeCounts(offer=1),
    )
    # Only the job-level offer should count (8), not 8 + 0.4*8.
    assert compute_outcome_delta(stats) == 8.0

    stats_with_peer = JobSignalStats(
        dedup_key="acme::1",
        outcomes=OutcomeCounts(interview=1),
        company_outcomes=OutcomeCounts(interview=2),
    )
    # Job interview (5) + one other company interview (0.4 * 5) = 7.
    assert compute_outcome_delta(stats_with_peer) == 5.0 + 0.4 * 5.0


def test_compute_outcome_delta_rejection_penalizes() -> None:
    stats = JobSignalStats(
        dedup_key="reject::1",
        outcomes=OutcomeCounts(rejected=1),
    )
    assert compute_outcome_delta(stats) < 0


class _FakeRepo:
    def __init__(self, stats: dict) -> None:
        self._stats = stats

    async def fetch_signal_stats(self, user_id: str, dedup_keys: list[str], **kwargs):
        return {k: v for k, v in self._stats.items() if k in dedup_keys}


def _job(company: str, score: float, dedup_key: str) -> MatchedJob:
    return MatchedJob(
        title="Engineer",
        company_name=company,
        dedup_key=dedup_key,
        match_score=score,
        base_score=score,
        behavior_boost=0.0,
        reason="Base fit.",
    )


@pytest.mark.asyncio
async def test_behavior_reranker_reorders_jobs() -> None:
    stats = {
        "boost::1": JobSignalStats(
            dedup_key="boost::1",
            user=EventCounts(impressions=10, clicks=5, applies=4, skips=0),
            global_=EventCounts(),
        ),
        "penalize::1": JobSignalStats(
            dedup_key="penalize::1",
            user=EventCounts(impressions=10, clicks=0, applies=0, skips=9),
            global_=EventCounts(),
        ),
    }
    reranker = BehaviorReranker(_FakeRepo(stats))  # type: ignore[arg-type]

    jobs = [
        _job("PenalizeCo", 80.0, "penalize::1"),
        _job("BoostCo", 75.0, "boost::1"),
    ]

    ranked = await reranker.apply(user_id="user-1", jobs=jobs)

    assert ranked[0].company_name == "BoostCo"
    assert ranked[0].behavior_boost is not None and ranked[0].behavior_boost > 0
    assert ranked[1].behavior_boost is not None and ranked[1].behavior_boost < 0
