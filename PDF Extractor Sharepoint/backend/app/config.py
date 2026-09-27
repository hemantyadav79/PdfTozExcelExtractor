import os
from dotenv import load_dotenv
root_env = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
backend_env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
if os.path.exists(root_env):
    load_dotenv(root_env)
else:
    load_dotenv(backend_env)
from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Local AI Bank Statement Converter"
    API_V1_STR: str = "/api"
    
    # Security
    # In production, change this secret key
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-for-local-ai-bank-converter-1234567890")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days for ease of local desktop use
    
    # Storage
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    TEMP_DIR: str = os.getenv("TEMP_DIR", "./temp")
    MAX_FILE_SIZE_MB: int = 150  # Handles large PDF bank statements
    ALLOWED_EXTENSIONS: List[str] = ["pdf", "jpg", "jpeg", "png", "tiff", "bmp"]
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    
    # OCR Settings
    TESSERACT_CMD: Optional[str] = os.getenv("TESSERACT_CMD", None)  # path to tesseract.exe on Windows if needed
    
    # Ollama settings
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    
    # SharePoint Integration
    AZURE_TENANT_ID: Optional[str] = os.getenv("AZURE_TENANT_ID")
    AZURE_CLIENT_ID: Optional[str] = os.getenv("AZURE_CLIENT_ID")
    AZURE_CLIENT_SECRET: Optional[str] = os.getenv("AZURE_CLIENT_SECRET")
    AZURE_USERNAME: Optional[str] = os.getenv("AZURE_USERNAME")
    AZURE_PASSWORD: Optional[str] = os.getenv("AZURE_PASSWORD")
    GRAPH_SCOPE: str = os.getenv("GRAPH_SCOPE", "Sites.ReadWrite.All Files.ReadWrite.All")
    SP_SITE_URL: Optional[str] = os.getenv("SP_SITE_URL")
    SP_LIBRARY_NAME: str = os.getenv("SP_LIBRARY_NAME", "Documents")
    SP_BASE_FOLDER: str = os.getenv("SP_BASE_FOLDER", "ProcessedDocuments")
    SP_CREATE_YEAR_FOLDER: bool = str(os.getenv("SP_CREATE_YEAR_FOLDER", "true")).lower() == "true"
    SP_CREATE_MONTH_FOLDER: bool = str(os.getenv("SP_CREATE_MONTH_FOLDER", "true")).lower() == "true"
    
    class Config:
        case_sensitive = True

settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.TEMP_DIR, exist_ok=True)
