import { sdkClient } from './sdk-client';
import type {
  ChatProfile,
  ChatProfileUpdateRequest,
  MatchingProfile,
  MatchingProfileUpdateRequest,
  MatchingProfileUpsertResponse,
  MediaPurpose,
  MediaUploadUrlResponse,
  MyProfileResponse,
} from 'onehook-api-client';
import { setCachedMediaPreview, blobToDataUrl } from '../utils/profile-image';
import { mediaKeyOwner, refreshViewPass, viewPasses, withViewPass } from '../lib/view-pass';
import { isNotFound } from '../lib/api-errors';

/**
 * Profile service wrapper.
 *
 * Design (OneHookBackend/docs/chat-only-profiles.md §8.1, §9.2): every account has a CHAT profile
 * (`PUT /profile/chat`: display name, avatar, birth date) and may have a MATCHING profile
 * (`PUT /profile/matching`: everything else, including the optional birth time and place), which
 * stays a DRAFT until matching is turned on in
 * State. Both are patch-merges (only non-null fields overwrite). The owner reads both with
 * `GET /profile`; another member's profile needs a view pass (see lib/view-pass.ts). Media is
 * uploaded to a presigned URL with a `purpose` (CHAT or MATCHING; only matching media is erased when
 * matching is turned off) and moderated asynchronously.
 */
export const ProfileApi = {
  /** The caller's own chat profile and, when one exists, matching profile. 404 before either exists. */
  getMine: async (): Promise<MyProfileResponse> => {
    return sdkClient.getMyProfile({});
  },

  /**
   * Creates or updates the chat profile. `birthDetails` is only `{ date }`: required on creation, then
   * immutable (a provisional date may be replaced once). Birth time and place go on the matching profile.
   */
  upsertChat: async (data: ChatProfileUpdateRequest) => {
    return sdkClient.upsertChatProfile(data);
  },

  /**
   * Creates or updates the matching profile. It stays a DRAFT (erased after 30 days without edits)
   * until matching is turned on. 409 MATCHING_ERASING while an opt-out is still erasing.
   * `birthTimePlace`: omitted keeps what is stored, an object replaces it whole, `{}` clears it.
   */
  upsertMatching: async (data: MatchingProfileUpdateRequest): Promise<MatchingProfileUpsertResponse> => {
    return sdkClient.upsertMatchingProfile(data);
  },

  /** A hook partner's (or an unlocked request sender's) chat profile, through a State pass. */
  getChat: async (userId: string): Promise<ChatProfile> => {
    return withViewPass('profile.chat', userId, (viewPass) => sdkClient.getChatProfile({ userId, viewPass }));
  },

  /** Another matching member's matching profile, through a Matching pass (discover page or likes). */
  getMatching: async (userId: string): Promise<MatchingProfile> => {
    return withViewPass('profile.matching', userId, (viewPass) =>
      sdkClient.getMatchingProfile({ userId, viewPass })
    );
  },

  delete: async (userId: string) => {
    return sdkClient.deleteProfile({ userId });
  },

  /** Requests a presigned S3 upload URL for media of the given purpose. */
  getUploadUrl: async (
    contentType: string,
    contentLength: number,
    purpose: MediaPurpose
  ): Promise<MediaUploadUrlResponse> => {
    return sdkClient.generateUploadUrl({ contentType, contentLength, purpose });
  },

  /**
   * A short-lived presigned GET URL for a private media object. Another member's media needs the pass
   * of the profile it belongs to (`media/{u}/chat/...` a chat pass, `media/{u}/matching/...` a
   * matching pass); one's own media needs none. A 404 refreshes the pass once and retries.
   */
  getDownloadUrl: async (key: string): Promise<{ downloadUrl: string; expiresInSeconds: number }> => {
    const owner = mediaKeyOwner(key);
    const read = async (viewPass: string | undefined) => {
      const res = await sdkClient.generateDownloadUrl({ key, viewPass });
      return { downloadUrl: String(res.downloadUrl), expiresInSeconds: Number(res.expiresInSeconds ?? 0) };
    };
    const passFor = () => (owner?.aud ? viewPasses.passFor(owner.aud, owner.ownerId) : undefined);
    try {
      return await read(passFor());
    } catch (err) {
      if (!isNotFound(err) || !owner?.aud) throw err;
      await refreshViewPass(owner.aud, [owner.ownerId]);
      const pass = passFor();
      if (!pass) throw err;
      return read(pass);
    }
  },

  /**
   * Uploads a media file end-to-end: obtains a presigned URL for `purpose`, POSTs or PUTs the bytes to
   * S3, caches the local preview, and returns the object key to store on the profile of that purpose.
   */
  uploadMedia: async (file: Blob, purpose: MediaPurpose): Promise<string> => {
    let contentType = file.type;
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = 'image/jpeg';
    }

    const contentLength = file.size > 0 ? file.size : 1024;
    const { uploadUrl, objectKey, formData } = await ProfileApi.getUploadUrl(contentType, contentLength, purpose);
    if (!uploadUrl || !objectKey) throw new Error('Media upload is unavailable. Please try again.');

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
