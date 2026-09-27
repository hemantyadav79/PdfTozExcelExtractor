from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
import uuid

from app.database.connection import get_db
from app.database.models import User, Document
from app.api import schemas
from app.security import auth
from app.services.queue import get_processing_queue

router = APIRouter()

@router.post("/", response_model=schemas.ExtractResponse)
async def trigger_extraction(
    payload: schemas.ExtractRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """
    Triggers the OCR & AI extraction process by queuing the document in the background.
    """
    # 1. Fetch document and verify ownership
    doc = db.query(Document).filter(
        Document.id == payload.document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    if doc.status == "processing":
        raise HTTPException(
            status_code=400,
            detail="Document is currently being processed."
        )
        
    # 2. Reset status/errors and record selected AI
    doc.status = "uploaded"
    doc.error_message = None
    doc.ai_provider = payload.ai_provider
    
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    # 3. Add to background worker queue (using the safe lazy getter)
    await get_processing_queue().put(doc.id)
    
    return {
        "document_id": doc.id,
        "status": "queued",
        "message": f"Document '{doc.filename}' queued for parsing using {payload.ai_provider}."
    }
