// Pure helpers for the Export screen's file-size display. No DOM/React deps
// so they stay unit-testable once the frontend Vitest project lands.

export type ExportFormat = 'png' | 'pdf' | 'jpg';

export interface ExportSizeEstimate {
  /** Estimated (or exact) output size in bytes. 0 when there is nothing to export. */
  bytes: number;
  /** True when the size is knowable without generating the file (PNG passthrough). */
  exact: boolean;
}

// Rough pdf-lib overhead: document skeleton (catalog, xref, trailer) plus
// per-page objects around each embedded image. The embedded PNG data itself
// is re-deflated by pdf-lib, so the total is inherently approximate.
const PDF_BASE_OVERHEAD_BYTES = 1024;
const PDF_PER_PAGE_OVERHEAD_BYTES = 256;

/**
 * Decoded byte length of a base64 string without decoding it:
 * floor(len * 3 / 4) minus padding. Handles unpadded base64 too.
 */
export function base64ByteLength(base64: string): number {
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Estimate the output size for exporting the given base64 PNG images.
 *
 * - `png`: the download is the decoded base64 bytes verbatim — exact.
 * - `pdf`: images are embedded (re-deflated) one per page — approximated as
 *   the summed image bytes plus small fixed overheads.
 * - `jpg`: re-encoded via canvas at quality 0.92; the real size is unknowable
 *   without encoding, so the summed PNG bytes serve as a rough estimate.
 */
export function estimateExportSize(format: ExportFormat, base64Images: string[]): ExportSizeEstimate {
  const imageBytes = base64Images.reduce((sum, b64) => sum + base64ByteLength(b64), 0);
  if (imageBytes === 0) return { bytes: 0, exact: false };
  if (format === 'pdf') {
    return {
      bytes: imageBytes + PDF_BASE_OVERHEAD_BYTES + PDF_PER_PAGE_OVERHEAD_BYTES * base64Images.length,
      exact: false,
    };
  }
  return { bytes: imageBytes, exact: format === 'png' };
}

/** Format a byte count as B / KB / MB with sensible rounding (e.g. "2.4 MB"). */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : String(Math.round(kb))} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : String(Math.round(mb))} MB`;
}

/**
 * Label for the Export screen's size row: "≈ 2.4 MB" for estimates,
 * exact values without the "≈", and "—" when there is nothing to export.
 */
export function exportSizeLabel(format: ExportFormat, base64Images: string[]): string {
  const { bytes, exact } = estimateExportSize(format, base64Images);
  if (bytes === 0) return '—';
  return `${exact ? '' : '≈ '}${formatByteSize(bytes)}`;
}
