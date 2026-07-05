import { beforeEach, describe, expect, it, vi } from 'vitest';

// heic2any spins up a browser Worker internally and cannot run under
// node/jsdom, so the module is mocked. fileToBase64 imports it dynamically;
// vi.mock intercepts that dynamic import too.
const heic2anyMock = vi.hoisted(() => vi.fn());
vi.mock('heic2any', () => ({ default: heic2anyMock }));

import {
  IMAGE_ACCEPT,
  fileToBase64,
  isAcceptableImage,
  isHeicFile,
} from '../src/lib/imageFile';

const makeFile = (name: string, type: string, content: BlobPart = 'x') =>
  new File([content], name, { type });

/** Decode a bare base64 string back to text for round-trip assertions. */
const fromBase64 = (b64: string) => atob(b64);

beforeEach(() => {
  heic2anyMock.mockReset();
});

describe('isHeicFile', () => {
  it('detects HEIC/HEIF by MIME type', () => {
    expect(isHeicFile(makeFile('photo', 'image/heic'))).toBe(true);
    expect(isHeicFile(makeFile('photo', 'image/heif'))).toBe(true);
  });

  it('detects by extension when file.type is empty (Windows picker / drag-and-drop)', () => {
    expect(isHeicFile(makeFile('IMG_0001.heic', ''))).toBe(true);
    expect(isHeicFile(makeFile('IMG_0001.heif', ''))).toBe(true);
  });

  it('detects by extension when file.type is wrong', () => {
    expect(isHeicFile(makeFile('IMG_0001.heic', 'application/octet-stream'))).toBe(true);
  });

  it('is case-insensitive on the extension', () => {
    expect(isHeicFile(makeFile('IMG_0001.HEIC', ''))).toBe(true);
    expect(isHeicFile(makeFile('IMG_0001.HeIf', ''))).toBe(true);
  });

  it('does not flag non-HEIC files', () => {
    expect(isHeicFile(makeFile('photo.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeicFile(makeFile('photo.png', 'image/png'))).toBe(false);
    // extension must be the final one
    expect(isHeicFile(makeFile('photo.heic.png', 'image/png'))).toBe(false);
    expect(isHeicFile(makeFile('archive.heics', ''))).toBe(false);
    expect(isHeicFile(makeFile('noextension', ''))).toBe(false);
  });
});

describe('isAcceptableImage', () => {
  it('accepts regular images by MIME type', () => {
    expect(isAcceptableImage(makeFile('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isAcceptableImage(makeFile('a.png', 'image/png'))).toBe(true);
    expect(isAcceptableImage(makeFile('a.webp', 'image/webp'))).toBe(true);
  });

  it('accepts HEIC even when the MIME type is empty', () => {
    expect(isAcceptableImage(makeFile('a.heic', ''))).toBe(true);
  });

  it('rejects non-image files', () => {
    expect(isAcceptableImage(makeFile('doc.pdf', 'application/pdf'))).toBe(false);
    expect(isAcceptableImage(makeFile('notes.txt', 'text/plain'))).toBe(false);
    expect(isAcceptableImage(makeFile('mystery', ''))).toBe(false);
  });
});

describe('IMAGE_ACCEPT', () => {
  it('includes explicit .heic/.heif extensions for pickers without a HEIC MIME mapping', () => {
    const parts = IMAGE_ACCEPT.split(',');
    expect(parts).toContain('image/*');
    expect(parts).toContain('.heic');
    expect(parts).toContain('.heif');
  });
});

describe('fileToBase64', () => {
  it('returns the bare base64 of a JPEG untouched, without invoking heic2any', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 'jpeg-bytes');
    const b64 = await fileToBase64(file);
    expect(fromBase64(b64)).toBe('jpeg-bytes');
    expect(heic2anyMock).not.toHaveBeenCalled();
  });

  it('returns the bare base64 of a PNG untouched (no data URL prefix)', async () => {
    const file = makeFile('shot.png', 'image/png', 'png-bytes');
    const b64 = await fileToBase64(file);
    expect(b64).not.toContain(',');
    expect(b64).not.toContain('data:');
    expect(fromBase64(b64)).toBe('png-bytes');
    expect(heic2anyMock).not.toHaveBeenCalled();
  });

  it('converts HEIC to JPEG via heic2any and returns the converted bytes', async () => {
    const converted = new Blob(['converted-jpeg'], { type: 'image/jpeg' });
    heic2anyMock.mockResolvedValueOnce(converted);

    const file = makeFile('IMG_0001.heic', ''); // empty MIME: extension-based path
    const b64 = await fileToBase64(file);

    expect(heic2anyMock).toHaveBeenCalledExactlyOnceWith({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
    expect(fromBase64(b64)).toBe('converted-jpeg');
  });

  it('uses the first blob when heic2any returns an array (multi-image HEIC)', async () => {
    heic2anyMock.mockResolvedValueOnce([
      new Blob(['first-frame'], { type: 'image/jpeg' }),
      new Blob(['second-frame'], { type: 'image/jpeg' }),
    ]);

    const b64 = await fileToBase64(makeFile('burst.heif', 'image/heif'));
    expect(fromBase64(b64)).toBe('first-frame');
  });

  it('propagates heic2any conversion failures', async () => {
    heic2anyMock.mockRejectedValueOnce(new Error('conversion failed'));
    await expect(fileToBase64(makeFile('bad.heic', 'image/heic'))).rejects.toThrow(
      'conversion failed',
    );
  });
});
