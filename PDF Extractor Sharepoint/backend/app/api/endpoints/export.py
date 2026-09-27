from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session
import io
import uuid

from app.database.connection import get_db
from app.database.models import User, Document, AuditLog
from app.api import schemas
from app.security import auth
from app.excel.generator import generate_bank_excel
from app.services.sharepoint_service import SharePointService

router = APIRouter()

@router.post("/")
def export_document_to_excel(
    payload: schemas.ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """
    Takes reviewed/edited bank statement data, generates the Excel worksheet,
    and directly uploads it to SharePoint instead of local storage.
    """
    # 1. Fetch document and verify ownership
    doc = db.query(Document).filter(
        Document.id == payload.document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    # 2. Build the Excel binary
    try:
        excel_bytes = generate_bank_excel(payload.edited_data)
        safe_name = doc.filename.rsplit(".", 1)[0] + ".xlsx"
        
        # 3. Upload directly to SharePoint
        sp_service = SharePointService(
            tenant_id=payload.sharepoint_tenant_id,
            client_id=payload.sharepoint_client_id,
            client_secret=payload.sharepoint_client_secret,
            site_url=payload.sharepoint_site_url,
            library_name=payload.sharepoint_library_name,
            base_folder=payload.sharepoint_base_folder,
            create_year_folder=payload.sharepoint_create_year_folder,
            create_month_folder=payload.sharepoint_create_month_folder
        )
        sp_url = sp_service.upload_excel(safe_name, excel_bytes, provided_token=payload.sharepoint_token)
        
        # Audit logging
        log_entry = AuditLog(
            user_id=current_user.id,
            action="export_excel_sharepoint",
            details=f"Exported '{doc.filename}' transactions spreadsheet directly to SharePoint"
        )
        db.add(log_entry)
        db.commit()
        
        return JSONResponse(
            status_code=200,
            content={
                "message": "File successfully uploaded to SharePoint.",
                "filename": safe_name,
                "sharepoint_url": sp_url
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"SharePoint upload failed: {str(e)}"
        )
