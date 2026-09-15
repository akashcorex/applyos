from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8005
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    database_url: str = "postgresql://postgres:postgres@localhost:5432/outreach"
    agent_service_token: str = ""
    api_url: str = "http://localhost:3333"
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
    latex_compiler: str = ""
    latex_timeout_seconds: float = 15.0
    allow_renderer_fallback: bool = True
    tailor_mode: str = "keyword"
    tailor_llm_on_create: bool = False
    tailor_max_suggestions: int = 5

    # --- Chroma Cloud (primary vector store) ---
    # Dummy defaults — set real values via env / .env from Chroma dashboard
    chroma_host: str = "api.trychroma.com"
    chroma_api_key: str = ""
    chroma_tenant: str = "your-chroma-tenant-id"
    chroma_database: str = "your-chroma-database"
    chroma_collection_prefix: str = "resumes"
    # Shard per user: collection = "{prefix}_{sanitized_user_id}"
    chroma_shard_by_user: bool = True
    # Sparse embeddings (keyword) — uses CHROMA_API_KEY
    chroma_sparse_enabled: bool = True
    # Hybrid RRF weights: 0.7 dense / 0.3 sparse balances semantic + keyword
    chroma_dense_weight: float = 0.7
    chroma_sparse_weight: float = 0.3
    chroma_rrf_k: int = 60
    # 16 KiB per document limit enforced via chunking
    chroma_max_doc_bytes: int = 16384

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
