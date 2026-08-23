import { sdkClient } from './sdk-client';
import { UserProfile } from '../types';
import type { ProfileUpdateRequest, MediaUploadUrlResponse } from 'onehook-api-client';
import { setCachedMediaPreview, blobToDataUrl } from '../utils/profile-image';

/**
 * Profile service wrapper.
 *
 * Design philosophy (see OneHookBackend/packages/profile): PUT /profile is a
 * patch-merge (only non-null fields overwrite). Media is uploaded by requesting
 * a presigned URL and PUTting or POSTing the binary directly to S3; moderation then runs
 * ASYNCHRONOUSLY (EventBridge -> Rekognition) and writes back `moderationStatus`
 * (APPROVED | REJECTED).
 */
export const ProfileApi = {
  get: async (userId: string) => {
    // Single source of truth: the Smithy-generated SDK. It now deserializes `fieldModerationStatus`
    // (the model is the contract; the client is generated from it) and resolves the endpoint through
    // the Vite dev proxy on localhost, so no bespoke fetch/URL logic is needed here.
    return (await sdkClient.getProfile({ userId })) as unknown as UserProfile;
  },

  upsert: async (userId: string, data: Partial<Omit<ProfileUpdateRequest, 'userId'>>) => {
    return (sdkClient as any).updateProfile({ userId, ...data });
  },

  delete: async (userId: string) => {
    return sdkClient.deleteProfile({ userId });
  },

  /**
   * Requests a presigned S3 upload URL.
   */
  getUploadUrl: async (
    userId: string,
    contentType: string,
    contentLength: number
  ): Promise<MediaUploadUrlResponse> => {
    return (await (sdkClient as any).generateUploadUrl({ contentType, contentLength })) as MediaUploadUrlResponse;
  },

  /**
   * Requests a short-lived presigned GET URL for a private media object so it can be displayed.
   *
   * The media bucket blocks public access, so this endpoint (GET /profile/media/download-url) is
   * the only read path. Routed through the generated SDK — the single source of truth for the API.
   *
   * @param key the S3 object key, e.g. "media/{userId}/{uuid}"
   * @returns the presigned URL and its lifetime in seconds
   */
  getDownloadUrl: async (key: string): Promise<{ downloadUrl: string; expiresInSeconds: number }> => {
    const res: any = await (sdkClient as any).generateDownloadUrl({ key });
    return { downloadUrl: res.downloadUrl, expiresInSeconds: res.expiresInSeconds };
  },

  /**
   * Uploads a media file end-to-end: obtains a presigned URL, POSTs or PUTs the bytes to
   * S3, caches the local preview, and returns the object key to store on the profile.
   */
  uploadMedia: async (userId: string, file: Blob): Promise<string> => {
    let contentType = file.type;
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = 'image/jpeg';
    }

    const contentLength = file.size > 0 ? file.size : 1024;
    const resUrl: any = await ProfileApi.getUploadUrl(userId, contentType, contentLength);
    const { uploadUrl, objectKey, formData } = resUrl;

    // Cache local data preview immediately for instantaneous rendering in UI
    try {
      const dataUrl = await blobToDataUrl(file);
      setCachedMediaPreview(objectKey, dataUrl);
    } catch (e) {
      console.warn('Could not generate data URL preview:', e);
    }

    if (formData && Object.keys(formData).length > 0) {
      const data = new FormData();
      // Ensure all signature and policy fields are added BEFORE the file payload
      for (const [key, value] of Object.entries(formData)) {
        data.append(key, value as string);
      }
      data.append('file', file);

      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: data,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error('S3 POST upload failed:', res.status, errorText);
        throw new Error(`Media upload failed with status ${res.status}: ${errorText}`);
      }
    } else {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error('S3 PUT upload failed:', res.status, errorText);
        throw new Error(`Media upload failed with status ${res.status}: ${errorText}`);
      }
    }

    return objectKey;
  },
};
