import os
import fitz  # PyMuPDF
from PIL import Image
import io
from typing import List, Tuple, Union, Optional

def is_native_pdf(file_path: str) -> bool:
    """
    Checks if a PDF has native text characters (i.e., is not a scanned image PDF).
    """
    try:
        doc = fitz.open(file_path)
        for page in doc:
            if page.get_text().strip():
                doc.close()
                return True
        doc.close()
    except Exception:
        pass
    return False

def extract_native_text(file_path: str) -> str:
    """
    Extracts text from a native PDF, preserving structure page by page.
    """
    text_content = []
    try:
        doc = fitz.open(file_path)
        for i, page in enumerate(doc):
            text_content.append(f"--- Page {i + 1} ---\n" + page.get_text("text"))
        doc.close()
    except Exception as e:
        return f"Error extracting native text: {str(e)}"
    return "\n".join(text_content)

def pdf_to_images(file_path: str, dpi: int = 150) -> List[Tuple[int, bytes]]:
    """
    Converts a PDF (scanned or native) to a list of PNG image bytes, one per page.
    """
    image_list = []
    try:
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=dpi)
            img_data = pix.tobytes("png")
            image_list.append((page_num + 1, img_data))
        doc.close()
    except Exception as e:
        print(f"Error converting PDF to images: {str(e)}")
    return image_list

def load_image_bytes(file_path: str) -> bytes:
    """
    Loads an image file (PNG, JPG, TIFF, BMP) and returns its bytes.
    """
    with open(file_path, "rb") as f:
        return f.read()
