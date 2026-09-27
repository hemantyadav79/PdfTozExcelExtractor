# PdfTozExcelExtractor / Local AI Bank Statement Converter

A comprehensive local AI-powered application for extracting, parsing, and converting PDF bank statements and documents into structured Excel formats. This project uses a FastAPI backend with local AI/OCR capabilities and a modern Next.js frontend, integrating with Microsoft Sharepoint.

## Features

- **Document Parsing**: Extracts text from PDF documents using advanced libraries (`pdfplumber`, `pymupdf`).
- **Local AI & OCR**: Supports document processing with local AI models and optical character recognition (`EasyOCR`, `PyTesseract`, `OpenCV`) for scanned or image-heavy PDFs.
- **Excel Export**: Converts parsed bank statements and tabular data into cleanly formatted Excel (`.xlsx`) files using `pandas` and `openpyxl`.
- **Microsoft Sharepoint Integration**: Authentication and secure file handling using `@azure/msal-react` (Frontend) and `msal` (Backend).
- **Modern Web Interface**: Responsive UI built with Next.js 16, React 19, Tailwind CSS 4, and AG Grid for viewing and editing extracted data.
- **One-Click Setup**: Includes a `run_local.bat` script for easy deployment, dependency management (both Python and Node.js), and starting background services.

## Project Structure

```
├── PDF Extractor Sharepoint/
│   ├── backend/               # FastAPI Python Backend
│   │   ├── app/               # Main application logic (AI, API, Database, OCR, Excel, etc.)
│   │   ├── requirements.txt   # Python dependencies
│   │   └── run.py             # Backend entry point
│   ├── frontend/              # Next.js React Frontend
│   │   ├── src/               # UI components and pages
│   │   ├── package.json       # Node.js dependencies
│   │   └── ...
│   └── run_local.bat          # Automated startup and control panel script
├── Doc1_Installation_Setup_Guide 2.docx
├── Doc2_Setup & User Manual.docx
├── document_bank_statement_processing_architecture.pdf
└── LocalAI_UserGuide 1.docx
```

## Prerequisites

- **Python 3.10+**: Ensure Python is added to your system PATH.
- **Node.js**: Required for running the Next.js frontend.
- **Tesseract-OCR**: Make sure Tesseract is installed and in your system PATH if using OCR capabilities.

## Installation & Usage

1. Open the folder `PDF Extractor Sharepoint`.
2. Run `run_local.bat` as an Administrator or regular user.
3. The script will automatically:
   - Check for Python and Node.js.
   - Create a Python virtual environment and install backend dependencies.
   - Install frontend dependencies (`npm install`).
   - Start the Backend Service on port `8000`.
   - Start the Frontend Service on port `3000`.
   - Open a browser window to `http://localhost:3000`.
4. Use the provided command-line Control Panel dashboard to start, stop, or restart individual services gracefully.

## Documentation

Please refer to the root directory for additional user guides and manuals:
- `Doc1_Installation_Setup_Guide 2.docx`
- `Doc2_Setup & User Manual.docx`
- `LocalAI_UserGuide 1.docx`
- `document_bank_statement_processing_architecture.pdf`

## Tech Stack

- **Backend**: FastAPI, SQLModel, Uvicorn, PyTorch, EasyOCR, OpenCV, PyMuPDF, Pandas, MSAL.
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, AG Grid, Lucide-React, Azure MSAL React.

