from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime

# ==========================================
# Authentication Schemas
# ==========================================
class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None

class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# ==========================================
# Document Schemas
# ==========================================
class DocumentOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    status: str
    ocr_engine: Optional[str] = None
    ai_provider: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class DocumentPreviewOut(BaseModel):
    id: uuid.UUID
    filename: str
    status: str
    extracted_data: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

# ==========================================
# Settings Schemas
# ==========================================
class ProviderSettingUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}
    provider_name: str  # "Ollama", "OpenAI", "Claude", "Gemini", "OpenRouter", etc.
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    additional_params: Optional[Dict[str, Any]] = None

class ProviderSettingOut(BaseModel):
    model_config = {
        "protected_namespaces": (),
        "from_attributes": True
    }
    provider_name: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    has_key: bool
    additional_params: Optional[Dict[str, Any]] = None

class ProviderTestRequest(BaseModel):
    provider_name: str


# ==========================================
# Extraction Schemas
# ==========================================
class ExtractRequest(BaseModel):
    document_id: uuid.UUID
    ai_provider: str = Field(default="Ollama")

class ExtractResponse(BaseModel):
    document_id: uuid.UUID
    status: str
    message: str

# ==========================================
# Export Schemas
# ==========================================
class ExportRequest(BaseModel):
    document_id: uuid.UUID
    edited_data: Dict[str, Any]  # The user can edit in AG Grid first, then pass to export
    sharepoint_token: Optional[str] = None
    sharepoint_site_url: Optional[str] = None
    sharepoint_library_name: Optional[str] = None
    sharepoint_base_folder: Optional[str] = None
    sharepoint_create_year_folder: Optional[bool] = None
    sharepoint_create_month_folder: Optional[bool] = None
    sharepoint_tenant_id: Optional[str] = None
    sharepoint_client_id: Optional[str] = None
    sharepoint_client_secret: Optional[str] = None

class SharePointTokenRedeemRequest(BaseModel):
    code: str
    redirect_uri: str
    tenant_id: str
    client_id: str
    client_secret: str

