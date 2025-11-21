"""Application configuration."""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    """Application settings."""
    
    # Database
    database_url: str = "postgresql://rag_user:rag_password@localhost:5433/rag_db"
    
    # Redis
    redis_url: str = "redis://localhost:6381/0"
    
    # Vector Store
    chroma_url: str = "http://localhost:8000"
    faiss_path: Optional[str] = None
    use_faiss: bool = False
    
    # LLM
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_version: Optional[str] = None
    openai_proxy: Optional[str] = None
    embedding_model: str = "text-embedding-ada-002"
    chat_model: str = "gpt-4-turbo-preview"
    vite_rag_api_url: Optional[str] = None  # ignore frontend env var when inherited
    
    # JWT - Use same secret as HR app for compatibility
    jwt_secret: str = "your-secret-key"  # Default matches HR app default
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    
    # RAG Configuration
    chunk_size: int = 800
    chunk_overlap: int = 200
    top_k_retrieval: int = 15
    top_k_final: int = 5
    rerank_enabled: bool = True
    min_confidence_threshold: float = 0.3
    
    # PII Detection
    pii_redaction_enabled: bool = True
    pii_entities: List[str] = ["PHONE_NUMBER", "EMAIL_ADDRESS", "US_SSN", "CREDIT_CARD", "PERSON"]
    
    # Caching
    cache_ttl_seconds: int = 3600
    embedding_cache_ttl: int = 86400
    
    # Observability
    log_level: str = "INFO"
    prometheus_enabled: bool = True
    enable_tracing: bool = True
    
    # Security
    encryption_key_placeholder: str = "change-this-to-actual-encryption-key"
    tls_enabled: bool = False
    
    # File Upload
    max_upload_size_mb: int = 50
    allowed_extensions: List[str] = ["pdf", "docx", "txt", "md"]
    
    # Celery
    celery_broker_url: str = "redis://localhost:6381/0"
    celery_result_backend: str = "redis://localhost:6381/0"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="allow",
    )


settings = Settings()

