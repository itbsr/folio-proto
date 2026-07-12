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


_EXIF_ORIENTATION_TAG = 0x0112


def _exif_orientation(image_bytes: bytes) -> int:
    """Best-effort read of the EXIF orientation tag (1 = upright / absent)."""
    try:
        with Image.open(BytesIO(image_bytes)) as pil:
            return int(pil.getexif().get(_EXIF_ORIENTATION_TAG, 1))
    except Exception:
        return 1


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode arbitrary image bytes into an HxWx3 uint8 RGB array.

    EXIF orientation is always honoured (issue #35): upright images (tag
    absent or 1) take the OpenCV fast path unchanged, while anything carrying
    a non-trivial orientation tag is decoded by PIL with
    ``ImageOps.exif_transpose``. Routing on the tag — instead of trusting
    ``cv2.imdecode`` — keeps rotation behaviour identical across decode paths
    and OpenCV builds/versions. The PIL fallback also covers HEIC / HEIF via
    pillow-heif.
    """
    if _exif_orientation(image_bytes) == 1:
        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None:
            return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    try:
        with Image.open(BytesIO(image_bytes)) as pil:
            # Rotated JPEGs and iPhone HEICs rely on the orientation tag;
            # apply it before convert.
            pil = ImageOps.exif_transpose(pil)
            return np.array(pil.convert("RGB"))
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValueError("Cannot decode image — unsupported format or corrupt data")
