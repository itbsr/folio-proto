const JPEG_QUALITY = 0.92;

/**
 * Re-encode a base64 PNG as a JPEG Blob via canvas. PNG results can have a
 * transparent background; JPEG has no alpha channel, so we paint white
 * behind the image first to avoid transparent areas turning black.
 */
export async function convertPngBase64ToJpegBlob(pngBase64: string, quality = JPEG_QUALITY): Promise<Blob> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load PNG for JPEG conversion'));
  });
  img.src = `data:image/png;base64,${pngBase64}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode JPEG'));
    }, 'image/jpeg', quality);
  });
}
