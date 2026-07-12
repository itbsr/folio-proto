"""Unit tests for inference.imaging.decode_image.

Regression coverage for issue #35: cv2.imdecode ignores the EXIF orientation
tag, so portrait phone JPEGs (Orientation=6) used to come out sideways.

Fixture images are generated on the fly with Pillow. The canonical *displayed*
image is asymmetric (40x20) and carries a red marker block in the top-left
corner, so the assertions pin down the actual rotation direction — not just a
width/height swap. The marker being red also asserts the RGB (not BGR)
channel order of the returned array.
"""

from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from inference.imaging import decode_image

# Canonical displayed image: 40 wide x 20 high, green background,
# red 8x8 marker in the top-left corner.
WIDTH, HEIGHT = 40, 20
MARKER = 8
RED = (255, 0, 0)
GREEN = (0, 200, 0)

# EXIF Orientation tag id.
ORIENTATION_TAG = 0x0112

# To build a fixture for orientation N we store the *inverse* transpose of the
# canonical image, so that applying the EXIF orientation reproduces it.
# (PIL's exif_transpose applies: 3 -> ROTATE_180, 6 -> ROTATE_270, 8 -> ROTATE_90.)
_INVERSE_TRANSPOSE = {
    1: None,
    3: Image.Transpose.ROTATE_180,
    6: Image.Transpose.ROTATE_90,
    8: Image.Transpose.ROTATE_270,
}


def make_canonical() -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), GREEN)
    img.paste(RED, (0, 0, MARKER, MARKER))
    return img


def jpeg_with_orientation(orientation: int) -> bytes:
    """JPEG bytes that display as the canonical image once EXIF is honoured."""
    stored = make_canonical()
    transpose = _INVERSE_TRANSPOSE[orientation]
    if transpose is not None:
        stored = stored.transpose(transpose)
    exif = Image.Exif()
    exif[ORIENTATION_TAG] = orientation
    buf = BytesIO()
    # subsampling=0 keeps the chroma of the small marker block crisp.
    stored.save(buf, format="JPEG", quality=95, subsampling=0, exif=exif)
    return buf.getvalue()


def assert_canonical(arr: np.ndarray) -> None:
    """The decoded array must be the upright canonical image, in RGB."""
    assert isinstance(arr, np.ndarray)
    assert arr.dtype == np.uint8
    assert arr.shape == (HEIGHT, WIDTH, 3)

    # Sample the interior of the marker / background to dodge JPEG edge noise.
    marker = arr[1 : MARKER - 1, 1 : MARKER - 1].reshape(-1, 3).mean(axis=0)
    assert marker[0] > 180, f"marker not red (RGB order?): {marker}"
    assert marker[1] < 100 and marker[2] < 100, f"marker not red: {marker}"

    bg = arr[HEIGHT - 8 : HEIGHT - 1, WIDTH - 12 : WIDTH - 1].reshape(-1, 3).mean(axis=0)
    assert bg[1] > 120, f"background not green (image rotated?): {bg}"
    assert bg[0] < 100 and bg[2] < 100, f"background not green: {bg}"


# ── EXIF orientation (issue #35) ────────────────────────────────────────────


def test_jpeg_orientation_6_portrait_phone_photo_is_rotated_upright():
    """Orientation=6 (typical portrait iPhone JPEG) must decode upright.

    This is the issue #35 regression test: without applying EXIF, the stored
    20x40 image would be returned sideways (marker at the bottom-left).
    """
    arr = decode_image(jpeg_with_orientation(6))
    assert_canonical(arr)


def test_jpeg_orientation_1_is_a_noop():
    arr = decode_image(jpeg_with_orientation(1))
    assert_canonical(arr)


def test_jpeg_orientation_3_is_rotated_180():
    arr = decode_image(jpeg_with_orientation(3))
    assert_canonical(arr)


def test_jpeg_orientation_8_is_rotated_upright():
    arr = decode_image(jpeg_with_orientation(8))
    assert_canonical(arr)


def test_orientation_applied_even_if_cv2_ignores_exif(monkeypatch):
    """Pins the issue #35 fix: orientation must not depend on cv2's EXIF pass.

    pip wheels of OpenCV >= 4.5.1 apply EXIF inside imdecode themselves, which
    masks the bug on dev machines and CI. Simulate an EXIF-ignorant build
    (pre-4.5.1, or a minimal self-compiled libopencv) and require the decoded
    image to come out upright anyway.
    """
    import cv2

    real_imdecode = cv2.imdecode

    def exif_ignorant_imdecode(buf, flags):
        return real_imdecode(buf, flags | cv2.IMREAD_IGNORE_ORIENTATION)

    monkeypatch.setattr(cv2, "imdecode", exif_ignorant_imdecode)

    arr = decode_image(jpeg_with_orientation(6))
    assert_canonical(arr)


# ── No-EXIF paths keep working ──────────────────────────────────────────────


def test_jpeg_without_exif_decodes_as_is():
    buf = BytesIO()
    make_canonical().save(buf, format="JPEG", quality=95, subsampling=0)
    arr = decode_image(buf.getvalue())
    assert_canonical(arr)


def test_png_passthrough_is_lossless():
    buf = BytesIO()
    make_canonical().save(buf, format="PNG")
    arr = decode_image(buf.getvalue())
    assert arr.shape == (HEIGHT, WIDTH, 3)
    assert tuple(arr[2, 2]) == RED  # exact: PNG is lossless
    assert tuple(arr[HEIGHT - 3, WIDTH - 3]) == GREEN


# ── Error contract ──────────────────────────────────────────────────────────


def test_undecodable_bytes_raise_value_error():
    with pytest.raises(ValueError):
        decode_image(b"definitely not an image")
