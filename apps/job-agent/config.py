from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8002
    registry_db_path: str = str(
        __import__("pathlib").Path(__file__).resolve().parent / "data" / "board_registry.db"
    )
    board_max_failures: int = 3
    board_cache_ttl_seconds: int = 3600
    board_reprobe_slots: int = 2
    board_reprobe_base_hours: int = 24
    board_reprobe_max_hours: int = 168
    job_max_age_days: int = 120
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
