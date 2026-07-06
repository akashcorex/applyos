from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8002
    http_timeout_seconds: float = 10.0
    http_max_retries: int = 3
    workable_max_pages: int = 50
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-6"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
