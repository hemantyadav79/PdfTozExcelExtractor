import os
from typing import Tuple
from app.config import settings

# Hex signatures for allowed file formats
MAGIC_NUMBERS = {
    "pdf": [b"%PDF"],
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "tiff": [b"II*\x00", b"MM\x00*"],
    "bmp": [b"BM"]
}

def validate_uploaded_file(filename: str, file_content_head: bytes, file_size_bytes: int) -> Tuple[bool, str]:
    """
    Validates file extension, maximum file size, and verifies the file type via magic bytes.
    
    Returns:
        (is_valid, error_message)
    """
    # 1. Check extension
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        return False, f"File extension .{ext} is not allowed. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        
    # 2. Check file size
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if file_size_bytes > max_bytes:
        return False, f"File size exceeds the limit of {settings.MAX_FILE_SIZE_MB}MB."
        
    # 3. Verify magic bytes / file signature
    signatures = MAGIC_NUMBERS.get(ext)
    if signatures:
        matched = False
        for sig in signatures:
            if file_content_head.startswith(sig):
                matched = True
                break
        if not matched:
            return False, f"File content validation failed. The file claims to be a .{ext} but its binary header does not match."
            
    return True, ""
