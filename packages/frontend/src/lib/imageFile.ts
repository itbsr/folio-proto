// HEIC files often report an empty `file.type` (Windows pickers, drag-and-drop),
// so detection must also look at the extension.
export const isHeicFile = (f: File) =>
  /\.(heic|heif)$/i.test(f.name) || f.type === 'image/heic' || f.type === 'image/heif';

export const isAcceptableImage = (f: File) => f.type.startsWith('image/') || isHeicFile(f);

// Explicit extensions make HEIC selectable in pickers that have no MIME mapping for it.
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

/**
 * Read a file as a bare base64 string for upload/preview, plus the MIME type
 * that actually describes those bytes (for building preview data URLs).
 * HEIC/HEIF is converted to JPEG client-side (browsers can't render HEIC in <img>,
 * and the converted JPEG doubles as the upload payload), so it reports `image/jpeg`.
 * Other files keep their own `file.type`; an empty type (some Windows pickers /
 * drag-and-drop) falls back to `application/octet-stream` — browsers sniff image
 * bytes in <img> regardless, and it avoids mislabeling unknown data.
 */
export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  let blob: Blob = file;
  let mimeType = file.type || 'application/octet-stream';
  if (isHeicFile(file)) {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    blob = Array.isArray(out) ? out[0] : out;
    mimeType = 'image/jpeg';
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { base64: dataUrl.split(',')[1], mimeType };
}
