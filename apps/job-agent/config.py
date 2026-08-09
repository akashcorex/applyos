from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8002
    http_timeout_seconds: float = 10.0
    http_max_retries: int = 3
    workable_max_pages: int = 50
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-6"
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embed_batch_size: int = 96
    semantic_top_k: int = 20
    explain_top_k: int = 10

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
