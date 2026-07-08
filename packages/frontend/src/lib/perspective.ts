/**
 * Perspective (projective) warp used by the manual Adjust screen: the four
 * corner handles define a quad on the corrected image, and "結果を更新"
 * re-projects that quad onto a straight rectangle.
 *
 * Everything except `warpPngBase64` is pure math on plain arrays (no canvas,
 * no DOM) so it can be unit-tested under jsdom.
 */

export type Point = { x: number; y: number };
/** Corner order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export const FULL_FRAME_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

/** Coefficients of the projective map (u,v) ∈ [0,1]² → quad:
 *  x = (a·u + b·v + c) / (g·u + h·v + 1), y = (d·u + e·v + f) / (g·u + h·v + 1) */
export type ProjectiveCoeffs = { a: number; b: number; c: number; d: number; e: number; f: number; g: number; h: number };

const EPS = 1e-9;

/**
 * Heckbert's closed-form unit-square → quad homography.
 * Returns null for degenerate (collinear) quads.
 */
export function squareToQuadCoeffs(quad: Quad): ProjectiveCoeffs | null {
  const [p0, p1, p2, p3] = quad;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;

  if (Math.abs(sx) < EPS && Math.abs(sy) < EPS) {
    // Affine special case (opposite edges parallel).
    return {
      a: p1.x - p0.x, b: p2.x - p1.x, c: p0.x,
      d: p1.y - p0.y, e: p2.y - p1.y, f: p0.y,
      g: 0, h: 0,
    };
  }

  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < EPS) return null;

  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return {
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y,
    g, h,
  };
}

export function projectUnitPoint(k: ProjectiveCoeffs, u: number, v: number): Point {
  const den = k.g * u + k.h * v + 1;
  return { x: (k.a * u + k.b * v + k.c) / den, y: (k.d * u + k.e * v + k.f) / den };
}

/** Output raster size for a warped quad: average opposite edge lengths. */
export function quadOutputSize(quad: Quad): { width: number; height: number } {
  const [p0, p1, p2, p3] = quad;
  const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  return {
    width: Math.max(1, Math.round((dist(p0, p1) + dist(p3, p2)) / 2)),
    height: Math.max(1, Math.round((dist(p0, p3) + dist(p1, p2)) / 2)),
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The Adjust stage shows the image with `object-fit: contain` inside a
 * fixed-aspect stage, so stage percentages ≠ image coordinates when aspect
 * ratios differ (letterboxing). Convert stage-percent corners (0..100) to
 * normalized image coordinates (0..1), clamped to the image.
 */
export function mapStageQuadToImageQuad(stageQuad: Quad, stageAspect: number, imageAspect: number): Quad {
  // Work in stage units where stage height = 1 and stage width = stageAspect.
  const scale = Math.min(stageAspect / imageAspect, 1);
  const dispW = imageAspect * scale;
  const dispH = scale;
  const offX = (stageAspect - dispW) / 2;
  const offY = (1 - dispH) / 2;
  return stageQuad.map((p) => ({
    x: clamp01(((p.x / 100) * stageAspect - offX) / dispW),
    y: clamp01((p.y / 100 - offY) / dispH),
  })) as Quad;
}

/** True when a normalized (0..1) quad covers the full image — i.e. a no-op. */
export function isFullFrameQuad(normQuad: Quad, eps = 0.002): boolean {
  const target = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
  ];
  return normQuad.every((p, i) => Math.abs(p.x - target[i].x) < eps && Math.abs(p.y - target[i].y) < eps);
}

/**
 * Warp the quad region of an RGBA source onto an outW×outH rectangle using
 * inverse mapping + bilinear sampling. Quad coordinates are continuous pixel
 * coordinates (image spans [0,srcW]×[0,srcH]; pixel centers at i+0.5), so a
 * full-frame quad reproduces the source exactly. Returns null for degenerate
 * quads. Pure math — safe without a canvas.
 */
export function warpImageToQuad(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  quad: Quad,
  outW: number,
  outH: number,
): Uint8ClampedArray<ArrayBuffer> | null {
  const k = squareToQuadCoeffs(quad);
  if (!k) return null;

  const out = new Uint8ClampedArray(outW * outH * 4);
  const maxX = srcW - 1, maxY = srcH - 1;

  for (let py = 0; py < outH; py++) {
    const v = (py + 0.5) / outH;
    for (let px = 0; px < outW; px++) {
      const u = (px + 0.5) / outW;
      const den = k.g * u + k.h * v + 1;
      if (Math.abs(den) < EPS) continue; // leave transparent
      // Continuous source position → pixel-center space.
      const sx = (k.a * u + k.b * v + k.c) / den - 0.5;
      const sy = (k.d * u + k.e * v + k.f) / den - 0.5;

      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const tx = sx - x0, ty = sy - y0;
      const cx0 = Math.max(0, Math.min(maxX, x0));
      const cx1 = Math.max(0, Math.min(maxX, x0 + 1));
      const cy0 = Math.max(0, Math.min(maxY, y0));
      const cy1 = Math.max(0, Math.min(maxY, y0 + 1));

      const i00 = (cy0 * srcW + cx0) * 4;
      const i10 = (cy0 * srcW + cx1) * 4;
      const i01 = (cy1 * srcW + cx0) * 4;
      const i11 = (cy1 * srcW + cx1) * 4;
      const oi = (py * outW + px) * 4;

      for (let ch = 0; ch < 4; ch++) {
        const top = src[i00 + ch] * (1 - tx) + src[i10 + ch] * tx;
        const bot = src[i01 + ch] * (1 - tx) + src[i11 + ch] * tx;
        out[oi + ch] = top * (1 - ty) + bot * ty;
      }
    }
  }
  return out;
}

// ── Canvas wrapper (browser only — not unit-testable in jsdom) ──

/**
 * Warp a base64 PNG to the rectangle defined by the given stage-percent quad
 * (corner handles). Returns the input unchanged when the quad is (effectively)
 * the full frame or degenerate, so an untouched Adjust screen is a no-op.
 */
export async function warpPngBase64(pngBase64: string, stageQuad: Quad, stageAspect: number): Promise<string> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load PNG for perspective warp'));
  });
  img.src = `data:image/png;base64,${pngBase64}`;
  await loaded;

  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return pngBase64;

  const norm = mapStageQuadToImageQuad(stageQuad, stageAspect, w / h);
  if (isFullFrameQuad(norm)) return pngBase64;

  const pixelQuad = norm.map((p) => ({ x: p.x * w, y: p.y * h })) as Quad;
  const { width: outW, height: outH } = quadOutputSize(pixelQuad);
  if (outW < 2 || outH < 2) return pngBase64;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Canvas 2D context unavailable');
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, w, h);

  const warped = warpImageToQuad(srcData.data, w, h, pixelQuad, outW, outH);
  if (!warped) return pngBase64;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Canvas 2D context unavailable');
  outCtx.putImageData(new ImageData(warped, outW, outH), 0, 0);

  const dataUrl = outCanvas.toDataURL('image/png');
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
