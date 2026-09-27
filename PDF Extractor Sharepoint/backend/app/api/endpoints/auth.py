from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session
from datetime import timedelta

from app.database.connection import get_db
from app.database.models import User, AuditLog
from app.api import schemas
from app.security import auth

router = APIRouter()

@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register_user(user_in: schemas.UserRegister, db: Session = Depends(get_db)):
    """Registers a new user on the system."""
    # Check if user already exists
    existing_user = db.query(User).filter(User.username == user_in.username).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="The username is already registered in the system."
        )
        
    hashed_password = auth.get_password_hash(user_in.password)
    
    # First user registered becomes admin
    total_users = db.query(User).count()
    role = "admin" if total_users == 0 else "user"
    
    new_user = User(
        username=user_in.username,
        hashed_password=hashed_password,
        role=role
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Audit log
    audit_entry = AuditLog(
        user_id=new_user.id,
        action="user_registered",
        details=f"User {new_user.username} registered with role: {new_user.role}"
    )
    db.add(audit_entry)
    db.commit()
    
    return new_user

@router.post("/login", response_model=schemas.Token)
def login_user(
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """OAuth2 compatible token login, retrieve access token."""
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account"
        )
        
    access_token_expires = timedelta(minutes=auth.settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = auth.create_access_token(user.id, expires_delta=access_token_expires)
    
    # Audit log
    audit_entry = AuditLog(
        user_id=user.id,
        action="user_login",
        details=f"User {user.username} successfully logged in."
    )
    db.add(audit_entry)
    db.commit()
    
    return {
        "access_token": token,
        "token_type": "bearer"
    }

@router.get("/me", response_model=schemas.UserOut)
def read_users_me(current_user: User = Depends(auth.get_current_active_user)):
    """Returns details of the currently authenticated user."""
    return current_user
