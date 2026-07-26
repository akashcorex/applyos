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

    # --- Local development resume fallback ---
    default_resume_path: str = ""

    # --- LinkedIn rate limits ---
    linkedin_max_connects_per_day: int = 20
    linkedin_max_follows_per_day: int = 40

    # --- Post-apply LinkedIn employee connects ---
    post_apply_linkedin_connect_enabled: bool = True
    post_apply_connect_limit: int = 3

    # --- CAPTCHA solver (CapSolver fallback; Lever prefers stealth silent-pass) ---
    captcha_api_key: str = ""
    captcha_provider: str = "capsolver"

    # --- Browser stealth ---
    # Headed Chrome greatly improves Lever invisible hCaptcha silent-pass.
    apply_headed: bool = False
    apply_use_chrome_channel: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
