"""Behavior signal types and scoring formulas for adaptive ranking."""

from __future__ import annotations

from dataclasses import dataclass, field

# Event reliability weights (apply >> click > skip; impression is denominator only).
CLICK_WEIGHT = 0.15
APPLY_WEIGHT = 0.35
SKIP_WEIGHT = 0.20
MAX_BEHAVIOR_SWING = 12.0  # max ± points on 0–100 scale
USER_SIGNAL_BLEND = 0.70
GLOBAL_SIGNAL_BLEND = 0.30
MIN_USER_IMPRESSIONS_FOR_FULL_WEIGHT = 5
OFFER_POINTS = 8.0
INTERVIEW_POINTS = 5.0
VIEWED_POINTS = 1.0
REJECTED_POINTS = -4.0
MAX_OUTCOME_SWING = 10.0


@dataclass
class EventCounts:
    impressions: int = 0
    clicks: int = 0
    applies: int = 0
    skips: int = 0

    @property
    def has_signal(self) -> bool:
        return self.impressions > 0 or self.clicks > 0 or self.applies > 0 or self.skips > 0


@dataclass
class OutcomeCounts:
    viewed: int = 0
    rejected: int = 0
    interview: int = 0
    offer: int = 0

    @property
    def has_signal(self) -> bool:
        return (
            self.viewed > 0
            or self.rejected > 0
            or self.interview > 0
            or self.offer > 0
        )


@dataclass
class JobSignalStats:
    dedup_key: str
    user: EventCounts = field(default_factory=EventCounts)
    global_: EventCounts = field(default_factory=EventCounts)
    outcomes: OutcomeCounts = field(default_factory=OutcomeCounts)
    company_outcomes: OutcomeCounts = field(default_factory=OutcomeCounts)


def _rate(count: int, impressions: int) -> float:
    return count / max(impressions, 1)


def _event_rates(counts: EventCounts) -> tuple[float, float, float]:
    imp = counts.impressions
    return (
        _rate(counts.clicks, imp),
        _rate(counts.applies, imp),
        _rate(counts.skips, imp),
    )


def blend_user_global_rates(
    user: EventCounts,
    global_: EventCounts,
) -> tuple[float, float, float]:
    """Blend per-user and global click/apply/skip rates."""
    u_click, u_apply, u_skip = _event_rates(user)
    g_click, g_apply, g_skip = _event_rates(global_)

    if not user.has_signal:
        return g_click, g_apply, g_skip

    if user.impressions < MIN_USER_IMPRESSIONS_FOR_FULL_WEIGHT:
        # Cold user history — lean on global trends.
        user_weight = USER_SIGNAL_BLEND * (user.impressions / MIN_USER_IMPRESSIONS_FOR_FULL_WEIGHT)
    else:
        user_weight = USER_SIGNAL_BLEND

    global_weight = 1.0 - user_weight

    return (
        user_weight * u_click + global_weight * g_click,
        user_weight * u_apply + global_weight * g_apply,
        user_weight * u_skip + global_weight * g_skip,
    )


def compute_outcome_delta(stats: JobSignalStats) -> float:
    """Score jobs using hiring outcomes, not only click/apply counts.

    Company outcomes are treated as *other* listings at the same company so a
    single offer is not counted once at job weight and again at company weight.
    """
    raw = 0.0
    job = stats.outcomes
    if job.has_signal:
        raw += (
            OFFER_POINTS * job.offer
            + INTERVIEW_POINTS * job.interview
            + VIEWED_POINTS * job.viewed
            + REJECTED_POINTS * job.rejected
        )

    company = stats.company_outcomes
    other = OutcomeCounts(
        viewed=max(0, company.viewed - job.viewed),
        rejected=max(0, company.rejected - job.rejected),
        interview=max(0, company.interview - job.interview),
        offer=max(0, company.offer - job.offer),
    )
    if other.has_signal:
        raw += 0.4 * (
            OFFER_POINTS * other.offer
            + INTERVIEW_POINTS * other.interview
            + VIEWED_POINTS * other.viewed
            + REJECTED_POINTS * other.rejected
        )
    return max(-MAX_OUTCOME_SWING, min(MAX_OUTCOME_SWING, raw))


def compute_behavior_delta(stats: JobSignalStats) -> float:
    """Return score adjustment in points (can be negative)."""
    if not stats.user.has_signal and not stats.global_.has_signal:
        return max(-MAX_BEHAVIOR_SWING, min(MAX_BEHAVIOR_SWING, compute_outcome_delta(stats)))

    click_r, apply_r, skip_r = blend_user_global_rates(stats.user, stats.global_)
    raw = (
        CLICK_WEIGHT * click_r
        + APPLY_WEIGHT * apply_r
        - SKIP_WEIGHT * skip_r
    )
    delta = raw * 100.0
    delta += compute_outcome_delta(stats)
    return max(-MAX_BEHAVIOR_SWING, min(MAX_BEHAVIOR_SWING, delta))


def behavior_reason(delta: float) -> str | None:
    if delta >= 3.0:
        return "Boosted from your prior applications and outcomes on similar roles."
    if delta <= -3.0:
        return "Lowered based on roles you skipped or that led to rejections."
    return None
