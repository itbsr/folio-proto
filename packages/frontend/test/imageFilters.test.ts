import { describe, expect, it } from 'vitest';

// Only the pure-math surface is tested: jsdom has no canvas 2D context, so
// applyFilterSettingsToPngBase64 (canvas wrapper) is exercised in the browser,
// while all kernel/color math runs here on plain Uint8ClampedArrays.
import {
  DEFAULT_FILTER_SETTINGS,
  type FilterSettings,
  applyFilterSettingsToImageData,
  applyUnsharpMask,
  buildCssFilter,
  isIdentityFilter,
  sharpnessToAmount,
} from '../src/lib/imageFilters';

const settings = (patch: Partial<FilterSettings> = {}): FilterSettings => ({
  ...DEFAULT_FILTER_SETTINGS,
  ...patch,
});

/** Solid w×h RGBA image. */
const solid = (w: number, h: number, [r, g, b, a]: number[]): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return data;
};

describe('isIdentityFilter', () => {
  it('is true for the defaults', () => {
    expect(isIdentityFilter(DEFAULT_FILTER_SETTINGS)).toBe(true);
  });

  it('is false when any control is active', () => {
    expect(isIdentityFilter(settings({ preset: 'paperwhite' }))).toBe(false);
    expect(isIdentityFilter(settings({ brightness: 1 }))).toBe(false);
    expect(isIdentityFilter(settings({ contrast: -1 }))).toBe(false);
    expect(isIdentityFilter(settings({ warmth: 5 }))).toBe(false);
    expect(isIdentityFilter(settings({ sharpness: 10 }))).toBe(false);
  });
});

describe('buildCssFilter', () => {
  it('returns "none" for identity settings', () => {
    expect(buildCssFilter(DEFAULT_FILTER_SETTINGS)).toBe('none');
  });

  it('maps the sliders to the CSS filter functions', () => {
    expect(buildCssFilter(settings({ brightness: 50 }))).toBe('brightness(1.25)');
    expect(buildCssFilter(settings({ contrast: -50 }))).toBe('contrast(0.75)');
    expect(buildCssFilter(settings({ warmth: 50 }))).toBe('sepia(0.25) saturate(1.1667)');
    // Negative warmth only desaturates (no negative sepia).
    expect(buildCssFilter(settings({ warmth: -30 }))).toBe('saturate(0.9)');
  });

  it('renders preset op chains in order', () => {
    expect(buildCssFilter(settings({ preset: 'magazine' }))).toBe(
      'contrast(1.18) brightness(1.04) saturate(1.05)',
    );
    expect(buildCssFilter(settings({ preset: 'blueprint' }))).toBe(
      'grayscale(1) sepia(0.6) hue-rotate(180deg) saturate(3) contrast(1.1)',
    );
  });

  it('never emits sharpness — it has no CSS equivalent', () => {
    expect(buildCssFilter(settings({ sharpness: 50 }))).toBe('none');
  });
});

describe('applyFilterSettingsToImageData', () => {
  it('is a no-op (same reference, same values) for identity settings', () => {
    const data = solid(2, 2, [10, 200, 130, 255]);
    const snapshot = [...data];
    const out = applyFilterSettingsToImageData(data, 2, 2, DEFAULT_FILTER_SETTINGS);
    expect(out).toBe(data);
    expect([...out]).toEqual(snapshot);
  });

  it('brightens and darkens in the right direction', () => {
    const brighter = applyFilterSettingsToImageData(solid(2, 1, [100, 100, 100, 255]), 2, 1, settings({ brightness: 50 }));
    expect(brighter[0]).toBe(125); // 100 × 1.25
    const darker = applyFilterSettingsToImageData(solid(2, 1, [100, 100, 100, 255]), 2, 1, settings({ brightness: -50 }));
    expect(darker[0]).toBe(75); // 100 × 0.75
  });

  it('contrast pushes values away from mid-gray', () => {
    const light = applyFilterSettingsToImageData(solid(1, 1, [200, 200, 200, 255]), 1, 1, settings({ contrast: 50 }));
    expect(light[0]).toBeGreaterThan(200);
    const dark = applyFilterSettingsToImageData(solid(1, 1, [50, 50, 50, 255]), 1, 1, settings({ contrast: 50 }));
    expect(dark[0]).toBeLessThan(50);
  });

  it('positive warmth tints gray toward red over blue', () => {
    const out = applyFilterSettingsToImageData(solid(1, 1, [128, 128, 128, 255]), 1, 1, settings({ warmth: 50 }));
    expect(out[0]).toBeGreaterThan(out[2]);
  });

  it('mono preset produces r ≈ g ≈ b', () => {
    const out = applyFilterSettingsToImageData(solid(1, 1, [180, 60, 20, 255]), 1, 1, settings({ preset: 'mono' }));
    expect(Math.abs(out[0] - out[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(out[1] - out[2])).toBeLessThanOrEqual(1);
  });

  it('clamps to [0, 255] instead of wrapping', () => {
    const high = applyFilterSettingsToImageData(solid(1, 1, [250, 250, 250, 255]), 1, 1, settings({ brightness: 50 }));
    expect(high[0]).toBe(255);
    const low = applyFilterSettingsToImageData(solid(1, 1, [0, 0, 0, 255]), 1, 1, settings({ contrast: 50 }));
    expect(low[0]).toBe(0);
  });

  it('combines sharpness with color ops (uniform image → only color applies)', () => {
    const out = applyFilterSettingsToImageData(solid(3, 3, [100, 100, 100, 255]), 3, 3, settings({ brightness: 50, sharpness: 25 }));
    for (let i = 0; i < out.length; i += 4) expect(out[i]).toBe(125);
  });

  it('leaves alpha untouched', () => {
    const out = applyFilterSettingsToImageData(solid(2, 1, [100, 100, 100, 128]), 2, 1, settings({ preset: 'paperwhite', brightness: 20, sharpness: 10 }));
    expect(out[3]).toBe(128);
    expect(out[7]).toBe(128);
  });
});

describe('sharpnessToAmount', () => {
  it('maps the slider to unsharp amounts (positive sharpens, negative softens)', () => {
    expect(sharpnessToAmount(0)).toBe(0);
    expect(sharpnessToAmount(25)).toBe(1);
    expect(sharpnessToAmount(50)).toBe(2);
    expect(sharpnessToAmount(-50)).toBe(-1); // -1 → exactly the blurred image
  });
});

describe('applyUnsharpMask', () => {
  /** 8×1 step edge: left half `lo`, right half `hi` (gray, opaque). */
  const stepEdge = (lo: number, hi: number): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(8 * 4);
    for (let x = 0; x < 8; x++) {
      const v = x < 4 ? lo : hi;
      data[x * 4] = v; data[x * 4 + 1] = v; data[x * 4 + 2] = v; data[x * 4 + 3] = 255;
    }
    return data;
  };

  it('does not change a uniform image', () => {
    const out = applyUnsharpMask(solid(4, 4, [100, 100, 100, 255]), 4, 4, 1);
    for (let i = 0; i < out.length; i += 4) expect(out[i]).toBe(100);
  });

  it('does not modify its input', () => {
    const src = stepEdge(100, 200);
    const snapshot = [...src];
    applyUnsharpMask(src, 8, 1, 1);
    expect([...src]).toEqual(snapshot);
  });

  it('increases local contrast across a step edge (undershoot + overshoot)', () => {
    const out = applyUnsharpMask(stepEdge(100, 200), 8, 1, 1);
    // For a 1-row image the 3×3 Gaussian collapses to [0.25, 0.5, 0.25]:
    // blur(x=3) = 125 → out = 100 + (100 − 125) = 75
    // blur(x=4) = 175 → out = 200 + (200 − 175) = 225
    expect(out[3 * 4]).toBe(75);
    expect(out[4 * 4]).toBe(225);
    // Pixels far from the edge are untouched.
    expect(out[0]).toBe(100);
    expect(out[7 * 4]).toBe(200);
  });

  it('negative amount −1 yields exactly the blurred image (soften)', () => {
    const out = applyUnsharpMask(stepEdge(100, 200), 8, 1, -1);
    expect(out[3 * 4]).toBe(125);
    expect(out[4 * 4]).toBe(175);
  });

  it('clamps overshoot at 0 and 255', () => {
    const out = applyUnsharpMask(stepEdge(0, 255), 8, 1, 2);
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(255);
    }
    expect(out[3 * 4]).toBe(0);   // 0 − 2·63.75 clamps
    expect(out[4 * 4]).toBe(255); // 255 + 2·63.75 clamps
  });

  it('preserves alpha', () => {
    const out = applyUnsharpMask(stepEdge(100, 200), 8, 1, 1.5);
    for (let x = 0; x < 8; x++) expect(out[x * 4 + 3]).toBe(255);
  });
});
