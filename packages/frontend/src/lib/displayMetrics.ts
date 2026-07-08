/**
 * Pure formatting/measurement helpers for the small set of overlay numbers
 * on the Capture/Processing/Compare screens that are honest to show (real
 * dimensions, real byte sizes, real elapsed time) — as opposed to the
 * hardcoded "measurement-style" numbers (confidence %, ISO/aperture,
 * homography error, skew/contrast/sharpness/coverage) that were removed
 * because they'd require real image analysis to back up (see issues #47, #41).
 *
 * Kept framework-free and side-effect-free so it can be unit tested without
 * a DOM/canvas/Image — anything that needs to *decode* an image (to learn
 * its pixel dimensions) still has to happen in the component via `Image`
 * `onload`; only the formatting of already-known numbers lives here.
 */

/**
 * Decoded byte length of a base64 string, accounting for `=` padding.
 * Accepts either a bare base64 string or a full `data:...;base64,xxxx` URL.
 */
export function base64ByteLength(base64: string): number {
  const commaIdx = base64.indexOf(',');
  const raw = commaIdx !== -1 && base64.slice(0, commaIdx).includes('base64')
    ? base64.slice(commaIdx + 1)
    : base64;
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.length === 0) return 0;
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

/** Human-readable byte size, e.g. `512 B`, `1.5 KB`, `3.0 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const decimals = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

/** Pixel dimensions as `WIDTH × HEIGHT`. */
export function formatDimensions(width: number, height: number): string {
  return `${Math.round(width)} × ${Math.round(height)}`;
}

/** Elapsed time in seconds, formatted as e.g. `12.3s`. Negative input clamps to `0.0s`. */
export function formatElapsedSeconds(seconds: number): string {
  const clamped = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${clamped.toFixed(1)}s`;
}
