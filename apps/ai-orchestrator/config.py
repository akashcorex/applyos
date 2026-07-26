from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    job_agent_url: str = "http://127.0.0.1:8002"
    apply_agent_url: str = "http://127.0.0.1:8003"
    redis_url: str = "redis://localhost:6379/0"
    workflow_ttl_seconds: int = 86400
    apply_result_timeout_seconds: int = 600
    http_timeout_seconds: float = 60.0
    post_apply_linkedin_connect_enabled: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
