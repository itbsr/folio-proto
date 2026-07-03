const MARGIN = 24; // pt
const REFERENCE_DPI = 150; // pixel-to-point conversion for page sizing

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const pxToPt = (px: number) => (px * 72) / REFERENCE_DPI;

/**
 * Build a multi-page PDF from base64 PNG images, one image per page.
 * Each page is sized to the image's own aspect ratio (plus a fixed margin)
 * rather than a fixed paper size, so there's no letterboxing from an
 * A4/image aspect-ratio mismatch. Images are embedded losslessly.
 */
export async function buildPdfFromPngImages(pngBase64Images: string[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (const base64 of pngBase64Images) {
    const png = await pdfDoc.embedPng(base64ToUint8Array(base64));
    const width = pxToPt(png.width);
    const height = pxToPt(png.height);
    const page = pdfDoc.addPage([width + MARGIN * 2, height + MARGIN * 2]);
    page.drawImage(png, { x: MARGIN, y: MARGIN, width, height });
  }

  return pdfDoc.save();
}

export function downloadBlob(data: Blob | Uint8Array, filename: string, type?: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
