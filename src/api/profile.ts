import { sdkClient } from './sdk-client';
import { UserProfile } from '../types';
import type { ProfileUpdateRequest, MediaUploadUrlResponse } from 'onehook-api-client';

/**
 * Profile service wrapper.
 *
 * Design philosophy (see OneHookBackend/packages/profile): PUT /profile is a
 * patch-merge (only non-null fields overwrite). Media is uploaded by requesting
 * a presigned URL and PUTting the binary directly to S3; moderation then runs
 * ASYNCHRONOUSLY (EventBridge -> Rekognition) and writes back `moderationStatus`
 * (APPROVED | REJECTED). There is no client-facing "moderate" endpoint — the
 * former synchronous ModerateMedia route is deprecated and must not be called.
 */
export const ProfileApi = {
  get: async (userId: string) => {
    return (await sdkClient.getProfile({ userId })) as unknown as UserProfile;
  },

  upsert: async (userId: string, data: Partial<Omit<ProfileUpdateRequest, 'userId'>>) => {
    return (sdkClient as any).updateProfile({ userId, ...data });
  },

  delete: async (userId: string) => {
    return sdkClient.deleteProfile({ userId });
  },

  /**
   * Requests a presigned S3 upload URL. Follow up by PUTting the raw bytes to
   * `uploadUrl`; the returned `objectKey` is what you persist on the profile.
   */
  getUploadUrl: async (
    userId: string,
    contentType: string,
    contentLength: number
  ): Promise<MediaUploadUrlResponse> => {
    return (await (sdkClient as any).generateUploadUrl({ userId, contentType, contentLength })) as MediaUploadUrlResponse;
  },

  /**
   * Uploads a media file end-to-end: obtains a presigned URL, PUTs the bytes to
   * S3, and returns the object key to store on the profile. Moderation happens
   * asynchronously server-side after the profile references the key.
   */
  uploadMedia: async (userId: string, file: Blob): Promise<string> => {
    const { uploadUrl, objectKey } = await ProfileApi.getUploadUrl(
      userId,
      file.type || 'application/octet-stream',
      file.size
    );
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) {
      throw new Error(`Media upload failed with status ${res.status}`);
    }
    return objectKey;
  },
};
