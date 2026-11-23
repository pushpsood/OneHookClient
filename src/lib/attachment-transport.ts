/**
 * Attachment transport: uploads the ciphertext to the presigned S3 URL, downloads + decrypts it back,
 * and caches the resulting object URLs so a re-render never re-downloads or re-decrypts.
 *
 * XMLHttpRequest is used instead of `fetch` for one reason: progress. `fetch` gives no upload-progress
 * events and only awkward download progress via a stream reader, whereas XHR reports both natively —
 * and a 100 MB attachment on a mobile connection needs a real progress bar, not a spinner. The wire
 * bytes are identical either way.
 *
 * S3 CORS rule (frozen contract): the bucket allows PUT/GET with only Content-Type and Content-Length.
 * We therefore set NO request headers on these calls — the browser derives Content-Length from the
 * body automatically (it is a forbidden header we could not set anyway), and adding any other header
 * would trigger a preflight the bucket is not configured to answer, failing the whole transfer.
 */

import { ChatApi } from '../api/chat';
import {
  decryptAttachmentFromEnvelope,
  type AttachmentEnvelope,
} from './chat-attachments';

/** 0..1 transfer progress. Reported best-effort — some S3 responses omit a content length. */
export type ProgressCallback = (fraction: number) => void;

function xhrError(action: string, xhr: XMLHttpRequest): Error {
  return new Error(`Attachment ${action} failed (${xhr.status || 'network error'}).`);
}

/**
 * PUTs the exact ciphertext to a presigned URL, reporting upload progress. Resolves only on a 2xx —
 * a signed-length mismatch or an expired URL surfaces as a rejected promise the caller turns into a
 * retry affordance.
 */
export function putCiphertext(
  uploadUrl: string,
  ciphertext: Uint8Array,
  onProgress?: ProgressCallback
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(xhrError('upload', xhr));
      }
    };
    xhr.onerror = () => reject(xhrError('upload', xhr));
    xhr.onabort = () => reject(new Error('Attachment upload was cancelled.'));
    // Send a fresh, offset-0 copy so exactly `ciphertext.byteLength` bytes go out — the value the
    // upload URL was signed for. A subarray view could carry a non-zero byteOffset on some paths.
    xhr.send(ciphertext.slice() as unknown as ArrayBuffer);
  });
}

/** GETs a presigned URL as raw bytes, reporting download progress. */
export function getCiphertext(
  downloadUrl: string,
  onProgress?: ProgressCallback
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', downloadUrl, true);
    xhr.responseType = 'arraybuffer';
    xhr.onprogress = (event) => {
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        onProgress?.(1);
        resolve(new Uint8Array(xhr.response as ArrayBuffer));
      } else {
        reject(xhrError('download', xhr));
      }
    };
    xhr.onerror = () => reject(xhrError('download', xhr));
    xhr.onabort = () => reject(new Error('Attachment download was cancelled.'));
    xhr.send();
  });
}

/**
 * A bounded LRU cache of decrypted-attachment object URLs, keyed by S3 object key.
 *
 * Why bounded + why it revokes: an object URL created from a decrypted Blob keeps that decrypted blob
 * — potentially a whole video — alive in memory for as long as the URL exists. Never revoking would
 * mean every attachment a user scrolls past stays decrypted in memory for the entire session, which is
 * both a memory leak and a privacy problem (plaintext media lingering long after it left the screen).
 * So the cache caps its entries and `URL.revokeObjectURL`s on eviction, and the owning conversation
 * calls {@link revokeAll} on unmount — decrypted media never outlives the conversation that showed it.
 *
 * The cache is intentionally scoped per conversation (one instance per open thread), not global: object
 * keys are globally unique, but a per-conversation lifetime is what makes "revoke on leaving the
 * conversation" correct and simple.
 */
export class AttachmentObjectUrlCache {
  private readonly urls = new Map<string, string>();
  /** The decrypted Blob behind each URL (same lifetime: dropped with its URL). */
  private readonly blobs = new Map<string, Blob>();
  private readonly inflight = new Map<string, Promise<string>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 16) {
    this.maxEntries = maxEntries;
  }

  /** Object URL for a key if already resolved, without triggering a download. */
  peek(objectKey: string): string | undefined {
    const url = this.urls.get(objectKey);
    if (url) this.touch(objectKey, url); // refresh LRU recency on a hit
    return url;
  }

  /**
   * Seeds the cache with a locally-available Blob (the file the local user just picked/recorded), so
   * their own sent attachment renders instantly and is NEVER downloaded back from S3 to be re-decrypted.
   */
  seedLocal(objectKey: string, blob: Blob): string {
    const existing = this.urls.get(objectKey);
    if (existing) return existing;
    const url = URL.createObjectURL(blob);
    this.store(objectKey, url, blob);
    return url;
  }

  /**
   * Resolves an envelope to a displayable object URL: cache hit → in-flight de-dup → download +
   * decrypt + cache. Concurrent bubbles for the same key (e.g. a thumbnail and the full view) share a
   * single download.
   */
  async resolve(
    envelope: AttachmentEnvelope,
    matchId: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    const cached = this.peek(envelope.objectKey);
    if (cached) return cached;

    const pending = this.inflight.get(envelope.objectKey);
    if (pending) return pending;

    const promise = (async () => {
      const { downloadUrl } = await ChatApi.getMediaDownloadUrl(matchId, envelope.objectKey);
      const ciphertext = await getCiphertext(downloadUrl, onProgress);
      const plaintext = await decryptAttachmentFromEnvelope(ciphertext, envelope);
      // Copy into a standalone ArrayBuffer: the decrypted view may sit at a non-zero offset inside a
      // larger buffer, and a Blob built from that would capture the whole backing store.
      const blob = new Blob([plaintext.slice() as unknown as ArrayBuffer], { type: envelope.mime });
      const url = URL.createObjectURL(blob);
      this.store(envelope.objectKey, url, blob);
      return url;
    })().finally(() => this.inflight.delete(envelope.objectKey));

    this.inflight.set(envelope.objectKey, promise);
    return promise;
  }

  /**
   * The decrypted bytes of an attachment, from this cache or downloaded and decrypted like
   * {@link resolve}. Used by "Ask Mr OneHook": the member's own device hands the plaintext to Mr OneHook
   * only after they selected the file and asked.
   */
  async resolveBlob(envelope: AttachmentEnvelope, matchId: string): Promise<Blob> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cached = this.blobs.get(envelope.objectKey);
      if (cached) return cached;
      await this.resolve(envelope, matchId);
    }
    const blob = this.blobs.get(envelope.objectKey);
    if (!blob) throw new Error('Attachment could not be read.');
    return blob;
  }

  /** Revokes every object URL and empties the cache. Called on conversation unmount/teardown. */
  revokeAll(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.blobs.clear();
    this.inflight.clear();
  }

  private store(objectKey: string, url: string, blob: Blob): void {
    this.urls.set(objectKey, url);
    this.blobs.set(objectKey, blob);
    // Evict least-recently-used entries beyond the cap, revoking as we go so their decrypted blobs
    // are released rather than merely dereferenced.
    while (this.urls.size > this.maxEntries) {
      const oldest = this.urls.keys().next().value;
      if (oldest === undefined) break;
      const stale = this.urls.get(oldest);
      if (stale) URL.revokeObjectURL(stale);
      this.urls.delete(oldest);
      this.blobs.delete(oldest);
    }
  }

  private touch(objectKey: string, url: string): void {
    // Re-insert to move the key to the most-recent end of the Map's insertion order (its LRU order).
    this.urls.delete(objectKey);
    this.urls.set(objectKey, url);
  }
}
