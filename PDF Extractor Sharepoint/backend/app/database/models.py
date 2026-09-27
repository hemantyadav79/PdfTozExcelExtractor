import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Relationship, JSON, Column

class User(SQLModel, table=True):
    __tablename__: str = "users"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    username: str = Field(unique=True, index=True, nullable=False)
    hashed_password: str = Field(nullable=False)
    role: str = Field(default="user")  # "admin" or "user"
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    documents: List["Document"] = Relationship(back_populates="user")
    settings: List["ProviderSetting"] = Relationship(back_populates="user")

class Document(SQLModel, table=True):
    __tablename__: str = "documents"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    filename: str = Field(nullable=False)
    file_path: str = Field(nullable=False)
    file_hash: str = Field(nullable=False, index=True)
    mime_type: str = Field(nullable=False)
    status: str = Field(default="uploaded")  # "uploaded", "processing", "completed", "failed"
    ocr_engine: Optional[str] = Field(default=None)
    ai_provider: Optional[str] = Field(default=None)
    error_message: Optional[str] = Field(default=None)
    extracted_data: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: User = Relationship(back_populates="documents")

class ProviderSetting(SQLModel, table=True):
    __tablename__: str = "provider_settings"
    model_config = {"protected_namespaces": ()}
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    provider_name: str = Field(nullable=False)  # "Ollama", "OpenAI", "Claude", etc.
    api_key_encrypted: Optional[str] = Field(default=None)
    base_url: Optional[str] = Field(default=None)
    model_name: Optional[str] = Field(default=None)
    additional_params: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: User = Relationship(back_populates="settings")

class AuditLog(SQLModel, table=True):
    __tablename__: str = "audit_logs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", nullable=True)
    action: str = Field(nullable=False)  # "login", "upload", "export", etc.
    details: str = Field(nullable=False)
    ip_address: Optional[str] = Field(default=None)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
