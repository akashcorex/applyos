from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8005
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    database_url: str = "postgresql://postgres:postgres@localhost:5432/outreach"
    job_agent_url: str = "http://127.0.0.1:8002"
    http_timeout_seconds: float = 60.0
    llm_model: str = "claude-sonnet-4-6"
    llm_max_tokens: int = 4096
    llm_timeout_seconds: float = 120.0
    embedding_provider: str = "openai"
    embedding_model: str = "text-embedding-3-small"
    rag_chunk_size: int = 1000
    rag_chunk_overlap: int = 200
    rag_collection_name: str = "resumes"
    rag_retrieval_k: int = 4

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
