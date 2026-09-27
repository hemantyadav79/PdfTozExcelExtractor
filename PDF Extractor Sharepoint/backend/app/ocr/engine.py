import os
import io
import logging
import numpy as np
from PIL import Image
import cv2
from typing import List, Dict, Any, Tuple, Optional
from app.config import settings

logger = logging.getLogger("app.ocr.engine")

class OCREngine:
    def __init__(self):
        self._paddle_ocr = None
        self._easy_ocr_reader = None
        
        # Configure Tesseract path if provided
        if settings.TESSERACT_CMD:
            import pytesseract
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

    def _get_paddleocr(self):
        if self._paddle_ocr is None:
            try:
                from paddleocr import PaddleOCR as POCR
                # Disable excessive logging from PaddleOCR
                logging.getLogger("ppocr").setLevel(logging.WARNING)
                self._paddle_ocr = POCR(use_angle_cls=True, lang="en")
                logger.info("PaddleOCR successfully initialized.")
            except ImportError:
                logger.warning("PaddleOCR not installed. Attempting EasyOCR fallback.")
            except Exception as e:
                logger.error(f"Failed to initialize PaddleOCR: {e}. Attempting EasyOCR fallback.")
        return self._paddle_ocr

    def _get_easyocr(self):
        if self._easy_ocr_reader is None:
            try:
                import easyocr
                self._easy_ocr_reader = easyocr.Reader(['en'], gpu=False)
                logger.info("EasyOCR successfully initialized.")
            except ImportError:
                logger.warning("EasyOCR not installed. Attempting Tesseract fallback.")
            except Exception as e:
                logger.error(f"Failed to initialize EasyOCR: {e}. Attempting Tesseract fallback.")
        return self._easy_ocr_reader

    def perform_ocr(self, image_bytes: bytes) -> Tuple[List[Dict[str, Any]], str]:
        """
        Runs OCR on image bytes using the best available engine.
        Returns:
            Tuple of (extracted_regions_list, engine_name_used)
            Each region: {"text": str, "box": List[List[float]], "confidence": float}
        """
        # Load image into numpy array for cv2/paddle/easyocr compatibility
        image = Image.open(io.BytesIO(image_bytes))
        img_np = np.array(image)
        
        # Convert RGB to BGR for CV2/Paddle if color channels are switched
        if len(img_np.shape) == 3 and img_np.shape[2] == 3:
            img_cv = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        else:
            img_cv = img_np

        # 1. Try EasyOCR
        easy_reader = self._get_easyocr()
        if easy_reader:
            try:
                # EasyOCR can accept image bytes or numpy array
                result = easy_reader.readtext(img_np)
                regions = []
                for line in result:
                    box = [[float(p[0]), float(p[1])] for p in line[0]]  # Box coordinates
                    text = line[1]
                    conf = float(line[2])
                    regions.append({
                        "text": text,
                        "box": box,
                        "confidence": conf
                    })
                return regions, "EasyOCR"
            except Exception as e:
                logger.error(f"EasyOCR processing error: {e}. Falling back...")

        # 2. Try PaddleOCR
        paddle_engine = self._get_paddleocr()
        if paddle_engine:
            try:
                # PaddleOCR expects a numpy array or file path
                result = paddle_engine.ocr(img_cv, cls=True)
                regions = []
                # PaddleOCR result is a list of lists of results per image page
                if result and result[0]:
                    for line in result[0]:
                        box = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                        text = line[1][0]
                        conf = float(line[1][1])
                        regions.append({
                            "text": text,
                            "box": box,
                            "confidence": conf
                        })
                return regions, "PaddleOCR"
            except Exception as e:
                logger.error(f"PaddleOCR processing error: {e}. Falling back...")

        # 3. Try Pytesseract
        try:
            import pytesseract
            # Tesseract requires PIL image
            pil_img = Image.open(io.BytesIO(image_bytes)).convert("L") # Greyscale
            data = pytesseract.image_to_data(pil_img, output_type=pytesseract.Output.DICT)
            regions = []
            
            n_boxes = len(data['level'])
            for i in range(n_boxes):
                # Only keep word level detections with actual text
                text = data['text'][i].strip()
                if not text:
                    continue
                    
                conf = float(data['conf'][i]) / 100.0 if data['conf'][i] != -1 else 0.5
                x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                
                # Make box coordinates matching PaddleOCR style: [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]
                box = [
                    [float(x), float(y)],
                    [float(x+w), float(y)],
                    [float(x+w), float(y+h)],
                    [float(x), float(y+h)]
                ]
                regions.append({
                    "text": text,
                    "box": box,
                    "confidence": conf
                })
            return regions, "Tesseract"
        except ImportError:
            logger.error("Pytesseract library not installed.")
        except Exception as e:
            logger.error(f"Tesseract OCR processing error: {e}")

        # If all fail, return empty list and error indicator
        return [], "None (OCR Engines Unavailable)"

# Singleton OCR Engine instance
ocr_engine = OCREngine()
