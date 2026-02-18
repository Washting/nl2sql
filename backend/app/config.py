from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # API Keys
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    anthropic_api_key: Optional[str] = None

    # LangSmith Configuration
    langchain_tracing_v2: bool = False
    langchain_api_key: Optional[str] = None
    langchain_project: str = "sql-agent-project"

    # Database Configuration
    database_url: str = "sqlite:///./data/sql_agent.db"
    metadata_database_url: str = "sqlite:///./data/metadata.db"

    # FastAPI Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # File Upload Configuration
    max_file_size: str = "100MB"
    upload_dir: str = "./data/uploads"

    # Visualization Configuration
    vis_output_dir: str = "./data/visualizations"

    # Model Configuration
    performance_model: str = "gpt-4o-mini"
    reasoning_model: str = "gpt-4o"
    performance_temperature: float = 0.0
    reasoning_temperature: float = 0.2

    # MLflow Debug Configuration
    mlflow_enabled: bool = False
    mlflow_tracking_uri: str = "file:./data/mlruns"
    mlflow_experiment_name: str = "nl2sql-llm-debug"
    mlflow_run_name_prefix: str = "sql-agent"

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


# Initialize settings
settings = Settings()

# Configure LangSmith if enabled
if settings.langchain_tracing_v2 and settings.langchain_api_key:
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
