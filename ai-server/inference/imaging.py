"""Image decoding utilities.

Kept torch / DewarpNet free so it can be imported and tested without the
model runtime (pipeline.py requires the DewarpNet clone that only exists
in the Docker image).
"""

from io import BytesIO

import cv2
import numpy as np
import pillow_heif
from PIL import Image, ImageOps, UnidentifiedImageError

# Lets PIL open HEIC / HEIF (and AVIF) containers.
pillow_heif.register_heif_opener()


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode arbitrary image bytes into an HxWx3 uint8 RGB array.

    Tries OpenCV first (JPEG / PNG / BMP / TIFF / WebP — keeps the existing
    fast path byte-identical), then falls back to PIL, which covers
    HEIC / HEIF via pillow-heif.
    """
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is not None:
        return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    try:
        with Image.open(BytesIO(image_bytes)) as pil:
            # iPhone HEICs rely on the orientation tag; apply it before convert.
            pil = ImageOps.exif_transpose(pil)
            return np.array(pil.convert("RGB"))
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValueError("Cannot decode image — unsupported format or corrupt data")
