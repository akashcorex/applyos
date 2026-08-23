from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    job_agent_url: str = "http://127.0.0.1:8002"
    apply_agent_url: str = "http://127.0.0.1:8003"
    resume_agent_url: str = "http://127.0.0.1:8005"
    api_url: str = "http://localhost:3333"
    # Shared only between trusted backend services; never expose to the browser.
    agent_service_token: str = ""
    redis_url: str = "redis://localhost:6379/0"
    workflow_ttl_seconds: int = 86400
    apply_result_timeout_seconds: int = 600
    http_timeout_seconds: float = 60.0
    post_apply_linkedin_connect_enabled: bool = True
    post_apply_connect_delay_seconds: int = 900
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-6"
    llm_max_tokens: int = 4096
    llm_timeout_seconds: float = 120.0
    decision_max_steps: int = 20
    applied_keys_ttl_seconds: int = 7776000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
