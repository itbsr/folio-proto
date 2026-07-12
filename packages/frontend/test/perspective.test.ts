import { describe, expect, it } from 'vitest';

// Only the pure-math surface is tested: jsdom has no canvas 2D context, so
// warpPngBase64 (canvas wrapper) is exercised in the browser, while the
// homography/warp math runs here on plain arrays.
import {
  FULL_FRAME_QUAD,
  type Quad,
  isFullFrameQuad,
  mapStageQuadToImageQuad,
  projectUnitPoint,
  quadOutputSize,
  squareToQuadCoeffs,
  warpImageToQuad,
} from '../src/lib/perspective';

const q = (points: number[][]): Quad =>
  points.map(([x, y]) => ({ x, y })) as Quad;

describe('squareToQuadCoeffs / projectUnitPoint', () => {
  it('maps the unit square to itself (identity)', () => {
    const k = squareToQuadCoeffs(q([[0, 0], [1, 0], [1, 1], [0, 1]]))!;
    expect(k).not.toBeNull();
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5], [0.25, 0.75]]) {
      const p = projectUnitPoint(k, u, v);
      expect(p.x).toBeCloseTo(u, 10);
      expect(p.y).toBeCloseTo(v, 10);
    }
  });

  it('maps unit-square corners onto arbitrary (projective) quad corners', () => {
    const quad = q([[10, 10], [90, 20], [80, 95], [5, 85]]);
    const k = squareToQuadCoeffs(quad)!;
    expect(k).not.toBeNull();
    const corners: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    corners.forEach(([u, v], i) => {
      const p = projectUnitPoint(k, u, v);
      expect(p.x).toBeCloseTo(quad[i].x, 8);
      expect(p.y).toBeCloseTo(quad[i].y, 8);
    });
  });

  it('handles the affine special case (parallelogram)', () => {
    const quad = q([[10, 10], [50, 20], [60, 60], [20, 50]]); // p3 = p0 - p1 + p2
    const k = squareToQuadCoeffs(quad)!;
    expect(k.g).toBe(0);
    expect(k.h).toBe(0);
    const p = projectUnitPoint(k, 1, 1);
    expect(p.x).toBeCloseTo(60, 10);
    expect(p.y).toBeCloseTo(60, 10);
  });

  it('returns null for a degenerate (collinear) quad', () => {
    expect(squareToQuadCoeffs(q([[0, 0], [1, 0], [2, 0], [3, 0]]))).toBeNull();
  });
});

describe('quadOutputSize', () => {
  it('returns the rectangle dimensions for an axis-aligned quad', () => {
    expect(quadOutputSize(q([[0, 0], [40, 0], [40, 30], [0, 30]]))).toEqual({ width: 40, height: 30 });
  });

  it('averages opposite edges of a trapezoid and never returns 0', () => {
    expect(quadOutputSize(q([[0, 0], [30, 0], [20, 10], [10, 10]]))).toEqual({ width: 20, height: Math.round((Math.hypot(10, 10) + Math.hypot(10, 10)) / 2) });
    expect(quadOutputSize(q([[5, 5], [5, 5], [5, 5], [5, 5]]))).toEqual({ width: 1, height: 1 });
  });
});

describe('mapStageQuadToImageQuad', () => {
  const STAGE = 4 / 3;

  it('is a straight 0..100 → 0..1 rescale when aspects match', () => {
    const out = mapStageQuadToImageQuad(q([[25, 50], [75, 50], [75, 100], [25, 100]]), STAGE, STAGE);
    expect(out[0].x).toBeCloseTo(0.25, 10);
    expect(out[0].y).toBeCloseTo(0.5, 10);
    expect(out[2].x).toBeCloseTo(0.75, 10);
    expect(out[2].y).toBeCloseTo(1, 10);
  });

  it('compensates vertical letterboxing for a wide image', () => {
    // 2:1 image in a 4:3 stage → displayed height 2/3 of stage, offset 1/6.
    const out = mapStageQuadToImageQuad(q([[50, 0], [50, 50], [50, 100 * (1 / 6)], [0, 0]]), STAGE, 2);
    expect(out[0].y).toBe(0);              // stage top is above the image → clamped
    expect(out[1].y).toBeCloseTo(0.5, 10); // stage middle = image middle
    expect(out[2].y).toBeCloseTo(0, 10);   // top of the displayed image
    expect(out[0].x).toBeCloseTo(0.5, 10); // full-width → x unaffected
  });

  it('compensates horizontal pillarboxing for a tall image', () => {
    // 1:2 image in a 4:3 stage → displayed width 0.5 stage-units, offset 5/12.
    const out = mapStageQuadToImageQuad(q([[50, 50], [0, 50], [100, 50], [50, 0]]), STAGE, 0.5);
    expect(out[0].x).toBeCloseTo(0.5, 10); // stage center = image center
    expect(out[1].x).toBe(0);              // stage left edge is in the pillarbox → clamped
    expect(out[2].x).toBe(1);              // stage right edge → clamped
  });

  it('maps the full-frame stage quad onto the full image', () => {
    const out = mapStageQuadToImageQuad(FULL_FRAME_QUAD, STAGE, 1.5);
    expect(isFullFrameQuad(out)).toBe(true);
  });
});

describe('isFullFrameQuad', () => {
  it('accepts exact and near-exact full coverage, rejects a real crop', () => {
    expect(isFullFrameQuad(q([[0, 0], [1, 0], [1, 1], [0, 1]]))).toBe(true);
    expect(isFullFrameQuad(q([[0.001, 0], [1, 0], [1, 1], [0, 0.999]]))).toBe(true);
    expect(isFullFrameQuad(q([[0.1, 0], [1, 0], [1, 1], [0, 1]]))).toBe(false);
  });
});

describe('warpImageToQuad', () => {
  /** 1-row image from red-channel values (g/b = 0, opaque). */
  const row = (values: number[]): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(values.length * 4);
    values.forEach((v, x) => {
      data[x * 4] = v;
      data[x * 4 + 3] = 255;
    });
    return data;
  };

  it('reproduces the source exactly for a full-frame quad', () => {
    const src = new Uint8ClampedArray(4 * 2 * 4);
    for (let i = 0; i < src.length; i++) src[i] = (i * 7) % 256;
    const out = warpImageToQuad(src, 4, 2, q([[0, 0], [4, 0], [4, 2], [0, 2]]), 4, 2)!;
    expect([...out]).toEqual([...src]);
  });

  it('crops to the right half of the image', () => {
    const src = row([10, 60, 110, 160]);
    const out = warpImageToQuad(src, 4, 1, q([[2, 0], [4, 0], [4, 1], [2, 1]]), 2, 1)!;
    expect(out[0]).toBe(110);
    expect(out[4]).toBe(160);
    expect(out[3]).toBe(255); // alpha carried through
  });

  it('bilinearly interpolates between pixels', () => {
    const src = row([0, 100]);
    // Quad centered between the two pixel centers of a 2×1 image.
    const out = warpImageToQuad(src, 2, 1, q([[0.5, 0], [1.5, 0], [1.5, 1], [0.5, 1]]), 1, 1)!;
    expect(out[0]).toBe(50);
  });

  it('returns null for a degenerate quad', () => {
    const src = row([10, 20, 30, 40]);
    expect(warpImageToQuad(src, 4, 1, q([[0, 0], [1, 0], [2, 0], [3, 0]]), 2, 1)).toBeNull();
  });
});
