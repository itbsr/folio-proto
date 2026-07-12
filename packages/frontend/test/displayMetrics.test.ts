import { describe, expect, it } from 'vitest';

import {
  base64ByteLength,
  formatBytes,
  formatDimensions,
  formatElapsedSeconds,
} from '../src/lib/displayMetrics';

// Note: decoding an image to learn its real pixel dimensions requires an
// `Image` `onload` round-trip (see ScreenCompare in DashboardPage.tsx),
// which jsdom cannot actually decode. That decode step is intentionally
// left untested here; only the pure formatting/math below is covered.

describe('base64ByteLength', () => {
  it('returns 0 for an empty string', () => {
    expect(base64ByteLength('')).toBe(0);
  });

  it('computes the decoded size of unpadded base64', () => {
    // "ABC" -> "QUJD", 3 bytes, no padding
    expect(base64ByteLength('QUJD')).toBe(3);
  });

  it('accounts for single "=" padding', () => {
    // "AB" -> "QUI=", 2 bytes
    expect(base64ByteLength('QUI=')).toBe(2);
  });

  it('accounts for double "==" padding', () => {
    // "A" -> "QQ==", 1 byte
    expect(base64ByteLength('QQ==')).toBe(1);
  });

  it('strips a data: URL prefix before measuring', () => {
    expect(base64ByteLength('data:image/png;base64,QUJD')).toBe(3);
  });

  it('ignores whitespace', () => {
    expect(base64ByteLength(' QU JD ')).toBe(3);
  });
});

describe('formatBytes', () => {
  it('formats zero and negative input as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-10)).toBe('0 B');
  });

  it('formats sub-KB sizes as whole bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats KB with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats MB with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats GB with one decimal', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
  });
});

describe('formatDimensions', () => {
  it('joins width and height with ×', () => {
    expect(formatDimensions(1920, 1080)).toBe('1920 × 1080');
  });

  it('rounds fractional dimensions', () => {
    expect(formatDimensions(800.4, 600.6)).toBe('800 × 601');
  });
});

describe('formatElapsedSeconds', () => {
  it('formats with one decimal and an "s" suffix', () => {
    expect(formatElapsedSeconds(12.34)).toBe('12.3s');
  });

  it('clamps negative values to 0.0s', () => {
    expect(formatElapsedSeconds(-3)).toBe('0.0s');
  });

  it('formats zero as 0.0s', () => {
    expect(formatElapsedSeconds(0)).toBe('0.0s');
  });

  it('rounds up correctly at the boundary', () => {
    expect(formatElapsedSeconds(0.999)).toBe('1.0s');
  });
});
