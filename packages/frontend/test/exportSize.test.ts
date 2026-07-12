import { describe, expect, it } from 'vitest';
import { base64ByteLength, estimateExportSize, exportSizeLabel, formatByteSize } from '../src/lib/exportSize';

// Issue #42 — the Export screen's size row was a hardcoded "≈ 2.4 MB" no
// matter the format, page count, or image content. These tests pin down the
// pure math behind the real computed value, per the module's doc comments.

describe('base64ByteLength', () => {
  // floor(len * 3/4) minus padding must recover the exact original byte
  // count for both padded (standard) and unpadded base64, without ever
  // decoding the string.
  describe('padded/unpadded exactness vs known byte counts', () => {
    it.each([1, 2, 3, 100, 1000, 251658])('recovers exactly %i bytes (padded)', (n) => {
      const padded = Buffer.alloc(n).toString('base64');
      expect(base64ByteLength(padded)).toBe(n);
    });

    it.each([1, 2, 3, 100, 1000, 251658])('recovers exactly %i bytes (unpadded)', (n) => {
      const unpadded = Buffer.alloc(n).toString('base64').replace(/=+$/, '');
      expect(base64ByteLength(unpadded)).toBe(n);
    });
  });

  it('returns 0 for an empty string', () => {
    expect(base64ByteLength('')).toBe(0);
  });
});

describe('formatByteSize', () => {
  it('renders sub-KB values as whole bytes', () => {
    expect(formatByteSize(0)).toBe('0 B');
    expect(formatByteSize(500)).toBe('500 B');
    expect(formatByteSize(1023)).toBe('1023 B');
  });

  it('renders KB with a decimal below 10 KB and whole numbers at/above it', () => {
    expect(formatByteSize(1024)).toBe('1.0 KB');
    expect(formatByteSize(46080)).toBe('45 KB');
    expect(formatByteSize(10240)).toBe('10 KB');
  });

  it('renders MB with a decimal below 10 MB and whole numbers at/above it', () => {
    expect(formatByteSize(1048576)).toBe('1.0 MB');
    expect(formatByteSize(2516583)).toBe('2.4 MB');
    expect(formatByteSize(10 * 1048576)).toBe('10 MB');
  });
});

describe('estimateExportSize / exportSizeLabel', () => {
  // A synthetic base64 string whose *length* (3,355,444 chars, no padding)
  // decodes to exactly 2,516,583 bytes — the same figure used in the PR's
  // manual verification. Content is irrelevant; only length/padding matter
  // to base64ByteLength.
  const bigImage = 'A'.repeat(3355444);

  it('PNG: exact size, no "≈" prefix (download is the decoded bytes verbatim)', () => {
    const estimate = estimateExportSize('png', [bigImage]);
    expect(estimate).toEqual({ bytes: 2516583, exact: true });
    expect(exportSizeLabel('png', [bigImage])).toBe('2.4 MB');
  });

  it('PDF: approximate size including base + per-page overhead, shown with "≈"', () => {
    const threePages = [bigImage, bigImage, bigImage];
    const estimate = estimateExportSize('pdf', threePages);
    // imageBytes (3 * 2,516,583) + 1024 base overhead + 256 * 3 per-page overhead
    expect(estimate).toEqual({ bytes: 3 * 2516583 + 1024 + 256 * 3, exact: false });
    expect(exportSizeLabel('pdf', threePages)).toBe('≈ 7.2 MB');
  });

  it('JPEG: approximate size from summed source PNG bytes, shown with "≈"', () => {
    const estimate = estimateExportSize('jpg', [bigImage]);
    expect(estimate).toEqual({ bytes: 2516583, exact: false });
    expect(exportSizeLabel('jpg', [bigImage])).toBe('≈ 2.4 MB');
  });

  describe('no result yet', () => {
    it('renders "—" for an empty image list', () => {
      expect(exportSizeLabel('png', [])).toBe('—');
      expect(exportSizeLabel('pdf', [])).toBe('—');
      expect(exportSizeLabel('jpg', [])).toBe('—');
    });

    it('renders "—" when the only entry is an empty string', () => {
      expect(exportSizeLabel('png', [''])).toBe('—');
    });
  });
});
