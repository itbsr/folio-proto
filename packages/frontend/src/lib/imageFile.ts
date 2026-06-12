// HEIC files often report an empty `file.type` (Windows pickers, drag-and-drop),
// so detection must also look at the extension.
export const isHeicFile = (f: File) =>
  /\.(heic|heif)$/i.test(f.name) || f.type === 'image/heic' || f.type === 'image/heif';

export const isAcceptableImage = (f: File) => f.type.startsWith('image/') || isHeicFile(f);

// Explicit extensions make HEIC selectable in pickers that have no MIME mapping for it.
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

/**
 * Read a file as a bare base64 string for upload/preview.
 * HEIC/HEIF is converted to JPEG client-side (browsers can't render HEIC in <img>,
 * and the converted JPEG doubles as the upload payload).
 */
export async function fileToBase64(file: File): Promise<string> {
  let blob: Blob = file;
  if (isHeicFile(file)) {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    blob = Array.isArray(out) ? out[0] : out;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(',')[1];
}
