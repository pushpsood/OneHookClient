/**
 * Browser-only helpers that derive attachment metadata from a picked/recorded file: image and video
 * dimensions, a small JPEG thumbnail, and a compact waveform for voice notes.
 *
 * Kept apart from `chat-attachments.ts` on purpose — that module is pure Web-Crypto and unit-tested
 * under Node, whereas everything here needs the DOM (canvas, <img>, <video>) and cannot run headless.
 * These are best-effort: a thumbnail or a set of dimensions is a nicety, so every function degrades to
 * "no metadata" rather than blocking a send if the browser refuses to decode a particular file.
 */

import {
  MAX_THUMBNAIL_BASE64_BYTES,
  MAX_WAVEFORM_BUCKETS,
  WAVEFORM_MAX_AMPLITUDE,
} from './chat-attachments';

/** Longest edge of a generated thumbnail. Small on purpose: it must fit in ≤12 KB of base64 JPEG. */
const THUMBNAIL_MAX_EDGE = 320;

/** Metadata extracted for image/video attachments. All fields are optional/best-effort. */
export interface VisualMetadata {
  width?: number;
  height?: number;
  durationMs?: number;
  /** base64 JPEG (no data: prefix), guaranteed ≤ 12 KB, or undefined if one could not be produced. */
  thumbnail?: string;
}

/**
 * Draws a source onto a canvas scaled to fit THUMBNAIL_MAX_EDGE and returns base64 JPEG under the
 * 12 KB cap, stepping quality down until it fits. Returns undefined rather than an over-cap thumbnail:
 * a too-large thumbnail would fail (or bloat) the DynamoDB message write, so "no thumbnail" is the
 * safe outcome.
 */
function encodeThumbnail(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): string | undefined {
  if (!sourceWidth || !sourceHeight) return undefined;
  const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.6, 0.45, 0.3, 0.2]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (base64.length <= MAX_THUMBNAIL_BASE64_BYTES) return base64;
  }
  return undefined;
}

/** Reads an image's natural dimensions and a thumbnail. */
export async function probeImage(file: Blob): Promise<VisualMetadata> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      thumbnail: encodeThumbnail(img, img.naturalWidth, img.naturalHeight),
    };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads a video's dimensions, duration, and a poster thumbnail from its first frame. */
export async function probeVideo(file: Blob): Promise<VisualMetadata> {
  const url = URL.createObjectURL(file);
  try {
    const video = await loadVideoMetadata(url);
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined;
    let thumbnail: string | undefined;
    try {
      await seekVideo(video, 0);
      thumbnail = encodeThumbnail(video, video.videoWidth, video.videoHeight);
    } catch {
      thumbnail = undefined; // a frame grab can fail (e.g. cross-origin taint); dimensions still stand
    }
    return { width: video.videoWidth, height: video.videoHeight, durationMs, thumbnail };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be decoded.'));
    img.src = url;
  });
}

function loadVideoMetadata(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('Video metadata could not be read.'));
    video.src = url;
  });
}

function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error('Video could not be seeked.'));
    video.currentTime = seconds;
  });
}

/**
 * Downsamples a stream of absolute amplitude samples (each 0..1) into at most 64 buckets scaled to
 * 0..31 — the exact waveform shape the voice-note bubble draws on every platform. Peak (not mean) per
 * bucket is used so a short loud syllable still shows as a tall bar rather than being averaged flat.
 */
export function downsampleWaveform(samples: number[]): number[] {
  if (samples.length === 0) return [];
  const bucketCount = Math.min(MAX_WAVEFORM_BUCKETS, samples.length);
  const bucketSize = samples.length / bucketCount;
  const buckets: number[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j += 1) {
      if (samples[j] > peak) peak = samples[j];
    }
    buckets.push(Math.max(0, Math.min(WAVEFORM_MAX_AMPLITUDE, Math.round(peak * WAVEFORM_MAX_AMPLITUDE))));
  }
  return buckets;
}
