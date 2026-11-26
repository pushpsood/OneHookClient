/**
 * HEIC/HEIF photos are converted to JPEG in the browser before upload (lib/heic-to-jpeg.ts):
 *   - detection by MIME type and by file name;
 *   - the real dynamic `import('heic2any')` path (mocked here: the library needs a browser Worker);
 *   - every failure (conversion error, import error, timeout, empty output) uploads the original file;
 *   - the 5 MB check runs on the converted file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  convertHeicToJpeg,
  HEIC_JPEG_QUALITY,
  isHeicFile,
  jpegFileName,
  prepareAttachmentFiles,
  type Heic2Any,
} from '../lib/heic-to-jpeg';
import { selectAttachments, type LocalFile } from '../lib/mr-onehook-attachments';

const heic2anyMock = vi.hoisted(() => vi.fn());
vi.mock('heic2any', () => ({ default: heic2anyMock }));

const MiB = 1024 * 1024;
const limits = { maxAttachmentBytes: 5 * MiB, maxAttachmentsPerMessage: 3 };

function local(name: string, type: string, size = 1000): LocalFile {
  return { name, size, type, blob: new Blob([new Uint8Array(Math.min(size, 16))], { type }) };
}

/** A Blob that reports `size` without allocating it. */
function sizedBlob(size: number, type = 'image/jpeg'): Blob {
  const b = new Blob([new Uint8Array(8)], { type });
  Object.defineProperty(b, 'size', { value: size });
  return b;
}

beforeEach(() => {
  heic2anyMock.mockReset();
});

describe('isHeicFile', () => {
  it('matches HEIC/HEIF by MIME type, any case', () => {
    expect(isHeicFile({ name: 'photo', type: 'image/heic' })).toBe(true);
    expect(isHeicFile({ name: 'photo', type: 'image/HEIF' })).toBe(true);
    expect(isHeicFile({ name: 'photo', type: 'image/heic-sequence' })).toBe(true);
  });

  it('matches by file name when the browser leaves the type empty or generic', () => {
    expect(isHeicFile({ name: 'IMG_0001.HEIC', type: '' })).toBe(true);
    expect(isHeicFile({ name: 'scan.heif', type: 'application/octet-stream' })).toBe(true);
  });

  it('ignores other files', () => {
    expect(isHeicFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
    expect(isHeicFile({ name: 'heic-notes.pdf', type: 'application/pdf' })).toBe(false);
    expect(isHeicFile({ name: '', type: '' })).toBe(false);
  });

  it('renames to .jpg', () => {
    expect(jpegFileName('IMG_0001.HEIC')).toBe('IMG_0001.jpg');
    expect(jpegFileName('photo')).toBe('photo.jpg');
    expect(jpegFileName('')).toBe('photo.jpg');
  });
});

describe('convertHeicToJpeg through the dynamic import', () => {
  it('converts with heic2any to image/jpeg and returns the JPEG as the file', async () => {
    const jpeg = sizedBlob(2 * MiB);
    heic2anyMock.mockResolvedValue(jpeg);
    const original = local('IMG_0001.HEIC', 'image/heic', 3 * MiB);
    const out = await convertHeicToJpeg(original);
    expect(heic2anyMock).toHaveBeenCalledWith({
      blob: original.blob,
      toType: 'image/jpeg',
      quality: HEIC_JPEG_QUALITY,
    });
    expect(out).toEqual({ name: 'IMG_0001.jpg', size: 2 * MiB, type: 'image/jpeg', blob: jpeg });
  });

  it('takes the first image of a multi-image HEIC', async () => {
    const first = sizedBlob(100);
    heic2anyMock.mockResolvedValue([first, sizedBlob(200)]);
    const out = await convertHeicToJpeg(local('burst.heic', 'image/heic'));
    expect(out.blob).toBe(first);
    expect(out.size).toBe(100);
  });

  it('a conversion error uploads the original file unchanged', async () => {
    heic2anyMock.mockImplementation(() =>
      Promise.reject({ code: 2, message: 'ERR_LIBHEIF format not supported' })
    );
    const original = local('IMG_0002.HEIC', 'image/heic');
    expect(await convertHeicToJpeg(original)).toBe(original);
  });

  it('an empty result uploads the original file unchanged', async () => {
    heic2anyMock.mockResolvedValue(sizedBlob(0));
    const original = local('IMG_0003.heic', '');
    expect(await convertHeicToJpeg(original)).toBe(original);
  });

  it('does not load or call heic2any for other files', async () => {
    const load = vi.fn();
    const pdf = local('notes.pdf', 'application/pdf');
    expect(await convertHeicToJpeg(pdf, load)).toBe(pdf);
    expect(await prepareAttachmentFiles([pdf], load)).toEqual([pdf]);
    expect(load).not.toHaveBeenCalled();
    expect(heic2anyMock).not.toHaveBeenCalled();
  });

  it('prepareAttachmentFiles converts only the HEIC files, keeping the order', async () => {
    heic2anyMock.mockResolvedValue(sizedBlob(500));
    const pdf = local('a.pdf', 'application/pdf');
    const out = await prepareAttachmentFiles([pdf, local('b.HEIC', 'image/heic')]);
    expect(out[0]).toBe(pdf);
    expect(out[1]).toMatchObject({ name: 'b.jpg', type: 'image/jpeg', size: 500 });
  });
});

describe('fallback when the library cannot be loaded', () => {
  afterEach(() => {
    // Back to the module-level mock for the tests below.
    vi.doMock('heic2any', () => ({ default: heic2anyMock }));
    vi.resetModules();
  });

  it('a failed dynamic import (e.g. the chunk did not download) uploads the original file', async () => {
    vi.resetModules();
    vi.doMock('heic2any', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const fresh = await import('../lib/heic-to-jpeg');
    const original = local('IMG_0004.HEIC', 'image/heic');
    expect(await fresh.convertHeicToJpeg(original)).toBe(original);
  });

  it('an injected loader that rejects also falls back', async () => {
    const original = local('IMG_0005.heif', 'image/heif');
    const out = await convertHeicToJpeg(original, () => Promise.reject(new Error('offline')));
    expect(out).toBe(original);
  });

  it('a conversion that never finishes falls back after the timeout', async () => {
    const never: Heic2Any = () => new Promise(() => {});
    const original = local('IMG_0006.HEIC', 'image/heic');
    expect(await convertHeicToJpeg(original, async () => never, 5)).toBe(original);
  });
});

describe('the 5 MB limit applies to the converted file', () => {
  it('a HEIC over 5 MB whose JPEG is under 5 MB is accepted', async () => {
    heic2anyMock.mockResolvedValue(sizedBlob(4 * MiB));
    const [jpeg] = await prepareAttachmentFiles([local('big.HEIC', 'image/heic', 6 * MiB)]);
    const { items, rejected } = selectAttachments([], [jpeg], limits);
    expect(rejected).toEqual([]);
    expect(items[0]).toMatchObject({ name: 'big.jpg', contentType: 'image/jpeg', sizeBytes: 4 * MiB });
  });

  it('a converted JPEG over 5 MB is refused like any other file that is too large', async () => {
    heic2anyMock.mockResolvedValue(sizedBlob(5 * MiB + 1));
    const [jpeg] = await prepareAttachmentFiles([local('huge.HEIC', 'image/heic', 4 * MiB)]);
    const { items, rejected } = selectAttachments([], [jpeg], limits);
    expect(items).toEqual([]);
    expect(rejected).toEqual([{ name: 'huge.jpg', reason: 'TOO_LARGE' }]);
  });

  it('when conversion fails, the original HEIC is checked (and kept when under the limit)', async () => {
    heic2anyMock.mockImplementation(() => Promise.reject(new Error('decode failed')));
    const [file] = await prepareAttachmentFiles([local('ok.HEIC', 'image/heic', 3 * MiB)]);
    const { items } = selectAttachments([], [file], limits);
    expect(items[0]).toMatchObject({ name: 'ok.HEIC', contentType: 'image/heic', sizeBytes: 3 * MiB });
  });
});
