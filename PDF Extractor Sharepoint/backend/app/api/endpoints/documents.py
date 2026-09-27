from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlmodel import Session
from typing import List
import uuid
import os
import hashlib
import datetime
import shutil

from app.database.connection import get_db
from app.database.models import User, Document, AuditLog
from app.api import schemas
from app.security import auth, file_validation
from app.config import settings

router = APIRouter()

def secure_shred_file(file_path: str) -> None:
    """Overwrites file contents with null bytes before deleting it to prevent recovery."""
    if os.path.exists(file_path):
        try:
            file_size = os.path.getsize(file_path)
            # Overwrite with zeros
            with open(file_path, "wb") as f:
                f.write(b"\x00" * file_size)
            # Remove file
            os.remove(file_path)
        except Exception as e:
            # Fallback direct remove if write permission fails mid-process
            if os.path.exists(file_path):
                os.remove(file_path)

@router.post("/upload", response_model=List[schemas.DocumentOut])
async def upload_documents(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """
    Accepts batch uploads, validates format integrity, and hashes content
    to track processing records.
    """
    saved_docs = []
    
    for upload_file in files:
        # Read file prefix for magic byte validation
        head = await upload_file.read(2048)
        
        # Read total size (need to seek back or read rest of stream)
        rest = await upload_file.read()
        total_size = len(head) + len(rest)
        full_content = head + rest
        
        # Seek reset for subsequent saves if needed (we have full_content now)
        is_valid, err_msg = file_validation.validate_uploaded_file(
            upload_file.filename,
            head,
            total_size
        )
        
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Validation failed for '{upload_file.filename}': {err_msg}"
            )
            
        # Compute SHA-256 hash to detect duplicate uploads
        file_hash = hashlib.sha256(full_content).hexdigest()
        
        # Check if hash already exists for this user
        existing_doc = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.file_hash == file_hash
        ).first()
        
        if existing_doc:
            saved_docs.append(existing_doc)
            continue
            
        # Generate safe local file name
        ext = upload_file.filename.split(".")[-1].lower() if "." in upload_file.filename else "dat"
        safe_filename = f"{uuid.uuid4()}.{ext}"
        local_path = os.path.join(settings.UPLOAD_DIR, safe_filename)
        
        # Save file to upload directory
        with open(local_path, "wb") as f:
            f.write(full_content)
            
        # Create DB record
        doc = Document(
            user_id=current_user.id,
            filename=upload_file.filename,
            file_path=local_path,
            file_hash=file_hash,
            mime_type=upload_file.content_type or f"application/{ext}",
            status="uploaded"
        )
        
        db.add(doc)
        db.commit()
        db.refresh(doc)
        
        # Log Audit
        log = AuditLog(
            user_id=current_user.id,
            action="upload_file",
            details=f"Uploaded document '{upload_file.filename}' (hash: {file_hash[:8]}...)"
        )
        db.add(log)
        db.commit()
        
        saved_docs.append(doc)
        
    return saved_docs

@router.get("/", response_model=List[schemas.DocumentOut])
def get_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Retrieve metadata of all uploaded documents for the user."""
    return db.query(Document).filter(Document.user_id == current_user.id).order_by(Document.created_at.desc()).all()

@router.get("/{document_id}", response_model=schemas.DocumentOut)
def get_document_status(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Query single document processing status and error states."""
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc

@router.get("/{document_id}/preview", response_model=schemas.DocumentPreviewOut)
def get_document_preview(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Retrieve the JSON representation of extracted transactions."""
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc

@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
def delete_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Deletes document metadata and securely shreds/deletes physical files."""
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    # Securely shred file
    secure_shred_file(doc.file_path)
    
    # Remove from db
    db.delete(doc)
    
    # Audit log
    log = AuditLog(
        user_id=current_user.id,
        action="delete_file",
        details=f"Securely deleted document '{doc.filename}'"
    )
    db.add(log)
    db.commit()
    
    return {"message": "Document deleted successfully."}
