/**
 * Filter model shared by the live preview and the export pipeline.
 *
 * The same `FilterSettings` drive two renderers that must stay in sync:
 *  - `buildCssFilter()` → CSS `filter` string for the GPU-accelerated live
 *    preview (sharpness has no CSS equivalent and is excluded here).
 *  - `applyFilterSettingsToImageData()` → per-pixel math on a raw RGBA
 *    `Uint8ClampedArray` used when exporting (PNG/JPG/PDF/ZIP), implementing
 *    the CSS filter functions' color matrices per the Filter Effects spec
 *    plus a real unsharp mask for sharpness.
 *
 * Everything except `applyFilterSettingsToPngBase64` is pure math (no canvas,
 * no DOM) so it can be unit-tested under jsdom.
 */

export type FilterPresetId = 'original' | 'magazine' | 'paperwhite' | 'mono' | 'blueprint' | 'amber';

export type FilterSettings = {
  preset: FilterPresetId;
  /** -50..50 slider values */
  brightness: number;
  contrast: number;
  warmth: number;
  sharpness: number;
};

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  preset: 'original',
  brightness: 0,
  contrast: 0,
  warmth: 0,
  sharpness: 0,
};

export function isIdentityFilter(s: FilterSettings): boolean {
  return s.preset === 'original' && s.brightness === 0 && s.contrast === 0 && s.warmth === 0 && s.sharpness === 0;
}

// ── Color operations ─────────────────────────────────────────

/** One CSS-filter-function-equivalent color operation. `value` is the CSS
 *  argument (multiplier for most ops, degrees for hue-rotate). */
export type ColorOp = {
  type: 'brightness' | 'contrast' | 'saturate' | 'grayscale' | 'sepia' | 'hue-rotate';
  value: number;
};

/** Preset looks, expressed as ordered color ops (applied left to right,
 *  matching CSS `filter` semantics). */
export const FILTER_PRESET_OPS: Record<FilterPresetId, ColorOp[]> = {
  original: [],
  magazine: [
    { type: 'contrast', value: 1.18 },
    { type: 'brightness', value: 1.04 },
    { type: 'saturate', value: 1.05 },
  ],
  paperwhite: [
    { type: 'contrast', value: 1.35 },
    { type: 'brightness', value: 1.14 },
    { type: 'saturate', value: 0.5 },
  ],
  mono: [
    { type: 'grayscale', value: 1 },
    { type: 'contrast', value: 1.22 },
    { type: 'brightness', value: 1.05 },
  ],
  blueprint: [
    { type: 'grayscale', value: 1 },
    { type: 'sepia', value: 0.6 },
    { type: 'hue-rotate', value: 180 },
    { type: 'saturate', value: 3 },
    { type: 'contrast', value: 1.1 },
  ],
  amber: [
    { type: 'sepia', value: 0.6 },
    { type: 'contrast', value: 1.12 },
    { type: 'brightness', value: 1.04 },
    { type: 'saturate', value: 1.2 },
  ],
};

/** Map slider values (-50..50) + preset to the full ordered op list. */
export function settingsToColorOps(s: FilterSettings): ColorOp[] {
  const ops = [...FILTER_PRESET_OPS[s.preset]];
  if (s.brightness !== 0) ops.push({ type: 'brightness', value: 1 + s.brightness / 200 });
  if (s.contrast !== 0) ops.push({ type: 'contrast', value: 1 + s.contrast / 200 });
  if (s.warmth > 0) ops.push({ type: 'sepia', value: s.warmth / 200 });
  if (s.warmth !== 0) ops.push({ type: 'saturate', value: 1 + s.warmth / 300 });
  return ops;
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);

/** CSS `filter` string for the live preview. Sharpness is intentionally not
 *  representable in CSS — it is previewed via `applyFilterSettingsToPngBase64`. */
export function buildCssFilter(s: FilterSettings): string {
  const ops = settingsToColorOps(s);
  if (ops.length === 0) return 'none';
  return ops.map((op) => (op.type === 'hue-rotate' ? `hue-rotate(${fmt(op.value)}deg)` : `${op.type}(${fmt(op.value)})`)).join(' ');
}

// ── Color matrix math (Filter Effects spec, sRGB) ────────────

/** 3×3 matrix (row-major) + offset, acting on RGB channels in 0..1. */
type ColorMatrix = { m: number[]; o: number[] };

const IDENTITY_M = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Luminance weights used by the spec's saturate/hue-rotate matrices.
const LR = 0.213, LG = 0.715, LB = 0.072;

function saturateMatrix(sat: number): ColorMatrix {
  return {
    m: [
      LR + (1 - LR) * sat, LG - LG * sat,       LB - LB * sat,
      LR - LR * sat,       LG + (1 - LG) * sat, LB - LB * sat,
      LR - LR * sat,       LG - LG * sat,       LB + (1 - LB) * sat,
    ],
    o: [0, 0, 0],
  };
}

const SEPIA_M = [
  0.393, 0.769, 0.189,
  0.349, 0.686, 0.168,
  0.272, 0.534, 0.131,
];

function opToMatrix(op: ColorOp): ColorMatrix {
  switch (op.type) {
    case 'brightness':
      return { m: [op.value, 0, 0, 0, op.value, 0, 0, 0, op.value], o: [0, 0, 0] };
    case 'contrast': {
      const c = 0.5 * (1 - op.value);
      return { m: [op.value, 0, 0, 0, op.value, 0, 0, 0, op.value], o: [c, c, c] };
    }
    case 'saturate':
      return saturateMatrix(op.value);
    case 'grayscale':
      return saturateMatrix(1 - op.value);
    case 'sepia': {
      const a = op.value;
      return { m: IDENTITY_M.map((v, i) => v + (SEPIA_M[i] - v) * a), o: [0, 0, 0] };
    }
    case 'hue-rotate': {
      const rad = (op.value * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      return {
        m: [
          LR + cos * (1 - LR) - sin * LR,  LG - cos * LG - sin * LG,        LB - cos * LB + sin * (1 - LB),
          LR - cos * LR + sin * 0.143,     LG + cos * (1 - LG) + sin * 0.14, LB - cos * LB - sin * 0.283,
          LR - cos * LR - sin * (1 - LR),  LG - cos * LG + sin * LG,        LB + cos * (1 - LB) + sin * LB,
        ],
        o: [0, 0, 0],
      };
    }
  }
}

/** Compose: apply `first`, then `second`. */
function composeMatrices(second: ColorMatrix, first: ColorMatrix): ColorMatrix {
  const m = new Array<number>(9);
  const o = new Array<number>(3);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      m[r * 3 + c] =
        second.m[r * 3] * first.m[c] +
        second.m[r * 3 + 1] * first.m[3 + c] +
        second.m[r * 3 + 2] * first.m[6 + c];
    }
    o[r] =
      second.m[r * 3] * first.o[0] +
      second.m[r * 3 + 1] * first.o[1] +
      second.m[r * 3 + 2] * first.o[2] +
      second.o[r];
  }
  return { m, o };
}

/** Apply an ordered op list to RGBA pixel data in place (alpha untouched). */
export function applyColorOpsInPlace(data: Uint8ClampedArray, ops: ColorOp[]): void {
  if (ops.length === 0) return;
  let mat: ColorMatrix = { m: [...IDENTITY_M], o: [0, 0, 0] };
  for (const op of ops) mat = composeMatrices(opToMatrix(op), mat);
  const { m, o } = mat;
  // Offsets are defined on 0..1 channels; scale to 0..255 once.
  const o0 = o[0] * 255, o1 = o[1] * 255, o2 = o[2] * 255;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    data[i]     = m[0] * r + m[1] * g + m[2] * b + o0;
    data[i + 1] = m[3] * r + m[4] * g + m[5] * b + o1;
    data[i + 2] = m[6] * r + m[7] * g + m[8] * b + o2;
  }
}

// ── Unsharp mask (sharpness) ─────────────────────────────────

/**
 * Slider (-50..50) → unsharp amount. Positive sharpens (up to 2.0);
 * negative blends toward the 3×3 Gaussian blur (-50 → fully blurred = soften).
 */
export function sharpnessToAmount(sharpness: number): number {
  return sharpness >= 0 ? sharpness / 25 : sharpness / 50;
}

/**
 * Unsharp mask on raw RGBA data: out = src + amount · (src − gaussianBlur3×3(src)).
 * Edges are handled by clamping (replicate). Alpha is copied through.
 * Returns a new array; the input is not modified.
 */
export function applyUnsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  if (amount === 0 || width <= 0 || height <= 0) {
    out.set(data);
    return out;
  }
  // 3×3 Gaussian kernel [1 2 1; 2 4 2; 1 2 1] / 16
  for (let y = 0; y < height; y++) {
    const ym = Math.max(0, y - 1) * width;
    const y0 = y * width;
    const yp = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(width - 1, x + 1);
      const idx = (y0 + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const blur =
          (data[(ym + xm) * 4 + ch] + 2 * data[(ym + x) * 4 + ch] + data[(ym + xp) * 4 + ch] +
           2 * data[(y0 + xm) * 4 + ch] + 4 * data[idx + ch] + 2 * data[(y0 + xp) * 4 + ch] +
           data[(yp + xm) * 4 + ch] + 2 * data[(yp + x) * 4 + ch] + data[(yp + xp) * 4 + ch]) / 16;
        out[idx + ch] = data[idx + ch] + amount * (data[idx + ch] - blur);
      }
      out[idx + 3] = data[idx + 3];
    }
  }
  return out;
}

// ── Combined pixel pipeline ──────────────────────────────────

/**
 * Apply the full filter settings (unsharp mask first, then color ops — the
 * same order the preview uses: CSS color filters on top of the sharpened
 * image). Returns the input array unchanged if the settings are a no-op,
 * otherwise a new array. Pure math — safe without a canvas.
 */
export function applyFilterSettingsToImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  s: FilterSettings,
): Uint8ClampedArray {
  const amount = sharpnessToAmount(s.sharpness);
  const ops = settingsToColorOps(s);
  if (amount === 0 && ops.length === 0) return data;
  const out = amount !== 0 ? applyUnsharpMask(data, width, height, amount) : new Uint8ClampedArray(data);
  applyColorOpsInPlace(out, ops);
  return out;
}

// ── Canvas wrapper (browser only — not unit-testable in jsdom) ──

/**
 * Re-encode a base64 PNG with the filter settings burned into the pixels.
 * Identity settings return the input untouched (byte-identical export).
 */
export async function applyFilterSettingsToPngBase64(pngBase64: string, s: FilterSettings): Promise<string> {
  if (isIdentityFilter(s)) return pngBase64;

  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load PNG for filtering'));
  });
  img.src = `data:image/png;base64,${pngBase64}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = applyFilterSettingsToImageData(imageData.data, canvas.width, canvas.height, s);
  if (out !== imageData.data) imageData.data.set(out);
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
