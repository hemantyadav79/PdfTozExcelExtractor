import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Any, Union, Optional
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session
import uuid

from app.config import settings
from app.database.connection import get_db
from app.database.models import User

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain text password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def create_access_token(
    subject: Union[str, Any], expires_delta: Optional[timedelta] = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    """Bypasses JWT validation for local single-user experience. Returns local_user."""
    local_user = db.query(User).filter(User.username == "local_user").first()
    if not local_user:
        # Create default local user on first run
        local_user = User(
            username="local_user",
            hashed_password="local_password_bypass",
            role="admin",
            is_active=True
        )
        db.add(local_user)
        db.commit()
        db.refresh(local_user)
    return local_user

def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user

def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user
