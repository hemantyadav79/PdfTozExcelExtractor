import asyncio
import os
import logging
import uuid
import datetime
import traceback
from typing import Dict, Any, Optional
from sqlmodel import Session

from app.database.connection import engine
from app.database.models import Document, AuditLog
from app.ocr.preprocessor import is_native_pdf, extract_native_text, pdf_to_images
from app.ocr.engine import ocr_engine
from app.ocr.layout import sort_ocr_results, detect_table_gridlines
from app.ai.manager import get_provider

logger = logging.getLogger("app.services.queue")

# Queue is initialized lazily inside start_queue_worker to avoid
# creating asyncio primitives before the event loop is running.
_processing_queue: Optional[asyncio.Queue] = None


def get_processing_queue() -> asyncio.Queue:
    """Returns the global processing queue, creating it if needed."""
    global _processing_queue
    if _processing_queue is None:
        _processing_queue = asyncio.Queue()
    return _processing_queue


# Keep a module-level alias so existing imports of `processing_queue` still work.
# This is a property-like accessor — callers that do `await processing_queue.put(x)`
# need to use `await get_processing_queue().put(x)` instead (see extract.py).
processing_queue = None  # Will be set in start_queue_worker


async def process_document_job(document_id: uuid.UUID) -> None:
    """
    Background worker job that:
    1. Reads document file details.
    2. Performs native text extraction or runs image conversion + OCR engine.
    3. Triggers layout sorting and table detection checks.
    4. Calls the configured local or cloud LLM.
    5. Stores the structured JSON results back into the database.
    """
    logger.info(f"Starting extraction task for Document ID: {document_id}")
    
    with Session(engine) as db:
        # 1. Fetch document and user metadata
        doc = db.get(Document, document_id)
        if not doc:
            logger.error(f"Document {document_id} not found in DB.")
            return
            
        doc.status = "processing"
        doc.updated_at = datetime.datetime.utcnow()
        db.add(doc)
        db.commit()
        db.refresh(doc)
        
        try:
            # Audit log start
            start_log = AuditLog(
                user_id=doc.user_id,
                action="process_start",
                details=f"Processing started for {doc.filename} using OCR: {doc.ocr_engine or 'auto'}, AI: {doc.ai_provider}"
            )
            db.add(start_log)
            db.commit()

            document_content_text = ""
            
            # 2. Check if native PDF
            if doc.filename.lower().endswith(".pdf") and is_native_pdf(doc.file_path):
                logger.info(f"Document {doc.filename} detected as Native PDF. Extracting vector text...")
                document_content_text = extract_native_text(doc.file_path)
            else:
                logger.info(f"Document {doc.filename} requires image-based OCR parsing...")
                # Extract page image representations
                pages_images = []
                if doc.filename.lower().endswith(".pdf"):
                    pages_images = pdf_to_images(doc.file_path, dpi=180)
                else:
                    # Single image file
                    with open(doc.file_path, "rb") as f:
                        pages_images = [(1, f.read())]
                
                # Run OCR page by page
                ocr_pages_text = []
                for p_num, img_bytes in pages_images:
                    logger.info(f"Running OCR on page {p_num}...")
                    regions, engine_used = ocr_engine.perform_ocr(img_bytes)
                    doc.ocr_engine = engine_used  # Update doc metadata with actual engine used
                    
                    # Sort OCR bounding boxes into rows
                    sorted_text = sort_ocr_results(regions)
                    
                    # Check for tables using OpenCV grid line finder
                    grid_stats = detect_table_gridlines(img_bytes)
                    
                    page_layout = f"--- Page {p_num} ---\n"
                    if grid_stats.get("table_detected"):
                        page_layout += f"[Layout Info: Detected potential table structures with {grid_stats['num_cells']} cells]\n"
                    page_layout += sorted_text
                    
                    ocr_pages_text.append(page_layout)
                    
                document_content_text = "\n\n".join(ocr_pages_text)

            # 3. Call AI manager
            if not doc.ai_provider:
                raise ValueError("No AI provider specified for extraction.")
                
            provider = get_provider(doc.ai_provider, db, doc.user_id)
            extracted_json = provider.extract(document_content_text)
            
            # 4. Save results to DB
            doc.extracted_data = extracted_json
            doc.status = "completed"
            
            success_log = AuditLog(
                user_id=doc.user_id,
                action="process_success",
                details=f"Successful extraction for {doc.filename} using {doc.ai_provider}."
            )
            db.add(success_log)
            logger.info(f"Extraction job completed successfully for Document: {doc.filename}")
            
        except Exception as e:
            error_details = traceback.format_exc()
            logger.error(f"Error processing document {document_id}: {str(e)}\n{error_details}")
            doc.status = "failed"
            doc.error_message = str(e)
            
            failure_log = AuditLog(
                user_id=doc.user_id,
                action="process_failure",
                details=f"Failed extraction for {doc.filename}. Error: {str(e)}"
            )
            db.add(failure_log)
            
        finally:
            doc.updated_at = datetime.datetime.utcnow()
            db.add(doc)
            db.commit()


async def queue_worker_loop() -> None:
    """Continuous worker loop processing items from the queue."""
    logger.info("Initializing background queue worker loop...")
    q = get_processing_queue()
    while True:
        document_id = None
        try:
            document_id = await q.get()
            await process_document_job(document_id)
        except asyncio.CancelledError:
            logger.info("Background queue worker cancelled.")
            break
        except Exception as e:
            logger.error(f"Error inside queue worker loop: {e}")
        finally:
            if document_id is not None:
                try:
                    q.task_done()
                except ValueError:
                    pass


# Worker task handle
_worker_task = None


def start_queue_worker() -> None:
    """Spins up the asyncio worker loop in the background."""
    global _worker_task, processing_queue
    if _worker_task is None:
        # Initialize the queue here, inside the running event loop context
        processing_queue = get_processing_queue()
        _worker_task = asyncio.create_task(queue_worker_loop())
        logger.info("Background queue worker thread successfully launched.")


def stop_queue_worker() -> None:
    """Stops the asyncio worker loop."""
    global _worker_task
    if _worker_task is not None:
        _worker_task.cancel()
        _worker_task = None
        logger.info("Background queue worker thread stopped.")
