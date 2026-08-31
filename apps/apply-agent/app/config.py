"""Environment configuration validated at startup via Pydantic Settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All environment variables consumed by apply-agent.

    Values come from the shell environment or a local `.env` file.
    Pydantic validates types on startup — the app will refuse to boot
    if a required variable is missing or malformed.
    """

    # --- Server ---
    host: str = "127.0.0.1"
    port: int = 8003

    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"

    # --- Anthropic (Claude Sonnet 4.6) ---
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-6"

    # --- API service (for persisting results) ---
    api_url: str = "http://localhost:3333"

    # --- Trusted internal service authentication ---
    # Shared with backend services only; never expose this token to the browser.
    agent_service_token: str = ""
    resume_agent_url: str = "http://127.0.0.1:8005"

    # --- Application task cancellation ---
    apply_cancellation_ttl_seconds: int = 86400

    # --- Test/dev fallbacks when CV fields are missing ---
    default_phone: str = "+919876543210"

    # --- LinkedIn profile URL fallback for ATS forms ---
    default_linkedin_url: str = ""

    # --- LinkedIn rate limits ---
    linkedin_max_connects_per_day: int = 20
    linkedin_max_follows_per_day: int = 40

    # --- Post-apply LinkedIn employee connects ---
    # Service-level kill switch. Per-user opt-in is still required by the orchestrator.
    post_apply_linkedin_connect_enabled: bool = True
    post_apply_connect_limit: int = 3
    post_apply_connect_delay_seconds: int = 900

    # --- CAPTCHA / manual-action handoff ---
    # Do not bypass site protections. Solver remains available only as an explicit opt-in.
    captcha_api_key: str = ""
    captcha_provider: str = "capsolver"
    captcha_solver_enabled: bool = False

    # --- Failure artifacts ---
    artifact_dir: str = "/tmp/applyos-artifacts"

    # --- Browser stealth ---
    # Headed Chrome greatly improves Lever invisible hCaptcha silent-pass.
    apply_headed: bool = False
    apply_use_chrome_channel: bool = True
    # Match locale/timezone to the machine/IP region when possible — CF compares
    # these against geo signals. Defaults suit IN; override via env for US/EU.
    apply_locale: str = "en-IN"
    apply_timezone: str = "Asia/Kolkata"

    # --- Human-in-the-loop ---
    hitl_mode: bool = True
    browser_session_ttl_seconds: int = 7200
    browser_session_human_wait_seconds: int = 1800
    browser_session_sweep_interval_seconds: int = 60

    class Config:
        env_file = ".env"


settings = Settings()
