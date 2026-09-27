import cv2
import numpy as np
import io
from PIL import Image
from typing import List, Dict, Any, Tuple

def sort_ocr_results(regions: List[Dict[str, Any]], y_tolerance: float = 10.0) -> str:
    """
    Sorts OCR bounding boxes geometrically (top-to-bottom, left-to-right).
    Groups words sharing roughly the same Y-axis into rows to reconstruct natural text.
    """
    if not regions:
        return ""

    # Calculate centroids or top-left points
    items = []
    for r in regions:
        box = r["box"]
        # box format: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
        x_coords = [p[0] for p in box]
        y_coords = [p[1] for p in box]
        min_x, max_x = min(x_coords), max(x_coords)
        min_y, max_y = min(y_coords), max(y_coords)
        
        items.append({
            "text": r["text"],
            "min_x": min_x,
            "max_x": max_x,
            "min_y": min_y,
            "max_y": max_y,
            "height": max_y - min_y
        })

    # Sort all by min_y first
    items.sort(key=lambda item: item["min_y"])

    # Group into lines
    lines: List[List[Dict[str, Any]]] = []
    current_line: List[Dict[str, Any]] = []
    
    if items:
        current_line.append(items[0])
        lines.append(current_line)
        
        for item in items[1:]:
            prev_item = current_line[-1]
            # If the item's Y starts near the previous item's vertical range, group them
            # We use a tolerance based on the height of the current line's text
            limit = max(y_tolerance, prev_item["height"] * 0.7)
            if abs(item["min_y"] - prev_item["min_y"]) < limit:
                current_line.append(item)
            else:
                current_line = [item]
                lines.append(current_line)

    # Sort each line by X-axis (left-to-right)
    reconstructed_text = []
    for line in lines:
        line.sort(key=lambda item: item["min_x"])
        # Join words with spaces or tabs to represent column separations
        row_str = ""
        for i, item in enumerate(line):
            if i > 0:
                # Add layout gaps based on distance between words
                gap = item["min_x"] - line[i-1]["max_x"]
                if gap > 40:
                    row_str += "\t"  # Tab for large distance (potential column)
                else:
                    row_str += " "
            row_str += item["text"]
        reconstructed_text.append(row_str)

    return "\n".join(reconstructed_text)

def detect_table_gridlines(image_bytes: bytes) -> Dict[str, Any]:
    """
    Uses OpenCV morphological filters to locate lines, grids, tables, 
    and identify table structures/stamps.
    """
    img_np = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_np, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return {"table_detected": False, "num_cells": 0}

    # 1. Adaptive thresholding
    thresh = cv2.adaptiveThreshold(
        img, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 2
    )

    # 2. Extract horizontal and vertical lines
    cols = thresh.shape[1]
    rows = thresh.shape[0]
    
    horizontal_size = cols // 30
    horizontal_struct = cv2.getStructuringElement(cv2.MORPH_RECT, (horizontal_size, 1))
    horizontal_lines = cv2.erode(thresh, horizontal_struct)
    horizontal_lines = cv2.dilate(horizontal_lines, horizontal_struct)

    vertical_size = rows // 30
    vertical_struct = cv2.getStructuringElement(cv2.MORPH_RECT, (1, vertical_size))
    vertical_lines = cv2.erode(thresh, vertical_struct)
    vertical_lines = cv2.dilate(vertical_lines, vertical_struct)

    # 3. Intersect horizontal and vertical lines to find table structures
    joints = cv2.bitwise_and(horizontal_lines, vertical_lines)
    
    # Find contours of joints
    contours, _ = cv2.findContours(joints, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    num_cells = len(contours)

    # Simple heuristics to detect stamps/signatures (high-density colored or standalone regions)
    # Since this is a grayscale image here, we return basic metrics
    has_table = num_cells > 6  # Typically a table grid has multiple intersections

    return {
        "table_detected": has_table,
        "num_cells": num_cells,
        "horizontal_lines_count": len(cv2.findContours(horizontal_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]),
        "vertical_lines_count": len(cv2.findContours(vertical_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0])
    }
