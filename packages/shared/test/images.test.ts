import { describe, expect, it } from 'vitest';
import { processImageSchema } from '../src/index';

describe('processImageSchema', () => {
  it('accepts a non-empty base64 image string', () => {
    const result = processImageSchema.safeParse({ image: 'aGVsbG8=' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty image string', () => {
    const result = processImageSchema.safeParse({ image: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing image field', () => {
    const result = processImageSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a non-string image', () => {
    const result = processImageSchema.safeParse({ image: 42 });
    expect(result.success).toBe(false);
  });
});
