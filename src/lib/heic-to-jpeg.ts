/**
 * HEIC / HEIF photos (the iPhone camera default) attached in the Mr OneHook chat are converted to JPEG
 * in the browser before upload, so Mr OneHook can look at the picture itself.
 *
 * The converter is `heic2any` (MIT, bundles libheif under LGPL-3.0; see THIRD_PARTY_NOTICES.md). It
 * is about 1.3 MB and starts a Web Worker when it loads, so it is fetched ONLY on demand with a dynamic
 * `import('heic2any')`: it is never in the main bundle, and members who never attach a HEIC photo never
 * download it. The library is used unmodified.
 *
 * Any failure (the chunk does not load, the browser cannot decode the file, the conversion times out)
 * returns the original file unchanged; the server can still read text from a HEIC image. The 5 MB
 * limit is checked afterwards on whatever comes back (selectAttachments), so a converted JPEG over the
 * limit is refused like any other file that is too large.
 */
import type { LocalFile } from './mr-onehook-attachments';

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);
const HEIC_EXTENSION = /\.(heic|heif)$/i;

/** JPEG quality for converted photos (heic2any's 0..1 scale). */
export const HEIC_JPEG_QUALITY = 0.9;
/** A conversion that takes longer than this falls back to the original file. */
export const HEIC_CONVERT_TIMEOUT_MS = 30_000;

/** True for a HEIC/HEIF photo, by MIME type or by file name (browsers often leave the type empty). */
export function isHeicFile(file: Pick<LocalFile, 'name' | 'type'>): boolean {
  return HEIC_MIME_TYPES.has((file.type || '').toLowerCase()) || HEIC_EXTENSION.test(file.name || '');
}

/** `IMG_0001.HEIC` -> `IMG_0001.jpg`; a name without the extension gets `.jpg` added. */
export function jpegFileName(name: string): string {
  const base = name || 'photo';
  return HEIC_EXTENSION.test(base) ? base.replace(HEIC_EXTENSION, '.jpg') : `${base}.jpg`;
}

/** heic2any's call signature (the part used here). */
export type Heic2Any = (options: {
  blob: Blob;
  toType?: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

export type Heic2AnyLoader = () => Promise<Heic2Any>;

/** Loads heic2any on first use (a separate chunk). The UMD build may surface as `default` or as the module. */
export const loadHeic2Any: Heic2AnyLoader = async () => {
  const mod = (await import('heic2any')) as unknown as { default?: unknown };
  const fn = typeof mod.default === 'function' ? mod.default : mod;
  if (typeof fn !== 'function') throw new Error('heic2any did not load');
  return fn as Heic2Any;
};

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HEIC conversion timed out')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Converts one HEIC/HEIF file to JPEG (the first image of a multi-image file). Any other file, and any
 * failure, comes back unchanged.
 */
export async function convertHeicToJpeg(
  file: LocalFile,
  load: Heic2AnyLoader = loadHeic2Any,
  timeoutMs: number = HEIC_CONVERT_TIMEOUT_MS
): Promise<LocalFile> {
  if (!isHeicFile(file)) return file;
  try {
    const heic2any = await load();
    const out = await withTimeout(
      heic2any({ blob: file.blob, toType: 'image/jpeg', quality: HEIC_JPEG_QUALITY }),
      timeoutMs
    );
    const jpeg = Array.isArray(out) ? out[0] : out;
    if (!jpeg || typeof jpeg.size !== 'number' || jpeg.size === 0) return file;
    return { name: jpegFileName(file.name), size: jpeg.size, type: 'image/jpeg', blob: jpeg };
  } catch {
    return file;
  }
}

/** Converts every HEIC/HEIF file in a pick (in order); other files pass through untouched. */
export async function prepareAttachmentFiles(
  files: readonly LocalFile[],
  load: Heic2AnyLoader = loadHeic2Any
): Promise<LocalFile[]> {
  if (!files.some(isHeicFile)) return [...files];
  return Promise.all(files.map((f) => convertHeicToJpeg(f, load)));
}
