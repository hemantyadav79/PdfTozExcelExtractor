# Bootstrap PyTorch/EasyOCR DLL loading on Windows before other imports
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
try:
    import torch
except Exception:
    pass

import uvicorn
import os
import sys

# Append parent dir to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    print("Launching Local AI Bank Converter Backend...")
    # Bind to localhost 8000 for standard API connectivity
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
