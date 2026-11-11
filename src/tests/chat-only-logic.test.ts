import { describe, it, expect } from 'vitest';
import { toPartnerProfile, toUserProfile, ownAvatar } from '../lib/profile-model';
import { errorCode, errorGaps, errorStatus } from '../lib/api-errors';
import { ApiError } from '../lib/api-client';
import {
  HOOK_COPY,
  acceptRequestErrorCopy,
  originLabel,
  selectionExplainer,
  sendRequestErrorCopy,
} from '../features/chat/hook-copy';
import { MATCHING_COPY, draftNotice, enableFailure, gapCopy } from '../features/settings/matching-mode';
import { notificationEffect } from '../lib/notification-effects';
import type { AppNotification } from '../api/notifications';

/** What the SDK throws for `{error, code}`: name = code, body fields copied, message = "UnknownError". */
const sdkError = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error('UnknownError'), {
    name: code,
    error: `${code} (test)`,
    code,
    $metadata: { httpStatusCode: status },
    ...extra,
  });

describe('toUserProfile (GET /profile → {chat, matching?})', () => {
  it('a chat-only member: name, age and avatar from the chat profile, no matching status', () => {
    const me = toUserProfile({
      chat: { userId: 'me', displayName: 'Asha', avatarKey: 'media/me/chat/a.jpg', age: 29, birthDateOnFile: true },
    });
    expect(me).toMatchObject({ id: 'me', userId: 'me', name: 'Asha', displayName: 'Asha', age: 29, photos: [] });
    expect(me.matchingStatus).toBeUndefined();
    expect(ownAvatar(me)).toBe('media/me/chat/a.jpg');
  });

  it('merges a matching draft under the chat profile, which owns the name', () => {
    const me = toUserProfile({
      chat: { userId: 'me', displayName: 'Asha', fieldModerationStatus: { displayName: 'PENDING' } },
      matching: {
        userId: 'me',
        status: 'DRAFT',
        displayName: 'Old name',
        bio: 'hi',
        pictures: ['media/me/matching/1.jpg'],
        draftExpiresAt: 1769600000,
        fieldModerationStatus: { bio: 'APPROVED' },
      },
    });
    expect(me.displayName).toBe('Asha');
    expect(me.bio).toBe('hi');
    expect(me.photos).toEqual(['media/me/matching/1.jpg']);
    expect(me.matchingStatus).toBe('DRAFT');
    expect(me.draftExpiresAt).toBe(1769600000);
    expect(me.fieldModerationStatus).toEqual({ bio: 'APPROVED', displayName: 'PENDING' });
    // Without a chat avatar the chrome falls back to the first matching picture.
    expect(ownAvatar(me)).toBe('media/me/matching/1.jpg');
  });

  it('a hook partner is their chat profile only (E51, E66)', () => {
    expect(toPartnerProfile({ userId: 'p', displayName: 'Bo', age: 31, avatarKey: 'media/p/chat/x' }, 'p')).toEqual({
      id: 'p',
      name: 'Bo',
      displayName: 'Bo',
      avatarKey: 'media/p/chat/x',
      age: 31,
    });
    expect(toPartnerProfile({ userId: undefined }, 'fallback').id).toBe('fallback');
  });
});

describe('api-errors', () => {
  it('reads the service code and status from an SDK exception', () => {
    const err = sdkError(409, 'CONNECTION_LIMIT');
    expect(errorStatus(err)).toBe(409);
    expect(errorCode(err)).toBe('CONNECTION_LIMIT');
  });

  it('reads them from the REST helper’s ApiError', () => {
    const err = new ApiError('Matching is off', 403, 'MATCHING_OFF');
    expect(errorStatus(err)).toBe(403);
    expect(errorCode(err)).toBe('MATCHING_OFF');
  });

  it('does not mistake an ordinary error name for a code', () => {
    expect(errorCode(new TypeError('x'))).toBeUndefined();
  });

  it('reads the gaps of MATCHING_PROFILE_INCOMPLETE', () => {
    expect(errorGaps(sdkError(409, 'MATCHING_PROFILE_INCOMPLETE', { gaps: ['PHOTOS', 'GENDER'] }))).toEqual(['PHOTOS', 'GENDER']);
    expect(errorGaps(new ApiError('x', 409, 'MATCHING_PROFILE_INCOMPLETE', { gaps: ['PHOTOS'] }))).toEqual(['PHOTOS']);
    expect(errorGaps(new Error('x'))).toEqual([]);
  });
});

describe('hook request and chooser copy', () => {
  it('locked rows say exactly "Unhook to see this request" (R23)', () => {
    expect(HOOK_COPY.lockedRequest).toBe('Unhook to see this request');
  });

  it('send errors describe only the sender’s own state, never the recipient (R4)', () => {
    expect(sendRequestErrorCopy(sdkError(409, 'CONNECTION_LIMIT'))).toMatch(/as many hooks as your plan allows/);
    expect(sendRequestErrorCopy(sdkError(409, 'SELECTION_REQUIRED'))).toMatch(/Choose which hooks to keep/);
    expect(sendRequestErrorCopy(sdkError(409, 'NOT_READY'))).toMatch(/Finish setting up/);
    for (const code of ['CONNECTION_LIMIT', 'SELECTION_REQUIRED', 'NOT_READY', 'X']) {
      expect(sendRequestErrorCopy(sdkError(409, code))).not.toMatch(/exist|not found|blocked|declined/i);
    }
  });

  it('accept errors: no free slot vs the request is gone', () => {
    expect(acceptRequestErrorCopy(sdkError(409, 'CONNECTION_LIMIT'))).toMatch(/Unhook someone/);
    expect(acceptRequestErrorCopy(sdkError(404, 'REQUEST_UNAVAILABLE'))).toBe('This request is no longer available.');
  });

  it('labels the hook origin', () => {
    expect(originLabel('REQUEST')).toBe('Connected by username');
    expect(originLabel('DISCOVERY')).toBe('Matched in discovery');
  });

  it('the chooser explains the limit and the auto-keep deadline', () => {
    const text = selectionExplainer(1, 3, 1767600000, 'en-GB');
    expect(text).toMatch(/allows one hook, and you have 3/);
    expect(text).toMatch(/we'll keep your most recently active chat/);
    expect(text).toMatch(/2026/);
    expect(selectionExplainer(2, 3)).toMatch(/after 7 days/);
  });
});

describe('matching mode', () => {
  it('enable failures surface the gaps to fix', () => {
    expect(enableFailure(sdkError(409, 'MATCHING_PROFILE_INCOMPLETE', { gaps: ['PHOTOS'] }))).toEqual({
      gaps: ['PHOTOS'],
      message: 'Your matching profile needs a few more things.',
    });
    expect(enableFailure(sdkError(409, 'MATCHING_ERASING')).message).toBe(MATCHING_COPY.erasingConflict);
    expect(gapCopy('PHOTOS')).toMatch(/3 photos/);
    expect(gapCopy('NO_MATCHING_PROFILE')).toMatch(/Create your matching profile/);
    expect(gapCopy('SOMETHING_NEW')).toBe('Finish your matching profile.');
  });

  it('the turn-off dialog says only chats are kept and everything comes back', () => {
    expect(MATCHING_COPY.disableDialogBody).toMatch(/Only your chats are kept/);
    expect(MATCHING_COPY.disableDialogBody).toMatch(/everything comes back into matching if you turn it on again/);
  });

  it('the draft notice states the 30-day rule and the reminder', () => {
    expect(draftNotice(undefined)).toMatch(/30 days without changes/);
    expect(draftNotice(undefined)).toMatch(/3 days before/);
    expect(draftNotice(1769600000, 'en-GB')).toMatch(/Edit it before .*2026/);
  });
});

describe('notification effects', () => {
  const n = (kind: string, body = ''): AppNotification => ({ id: '1', userId: 'me', kind, title: 't', body, createdAt: 1 });

  it('a suspension or resume re-reads the state', () => {
    expect(notificationEffect(n('CONVERSATION_SUSPENDED', 'paused'))).toMatchObject({ refreshState: true, toast: { message: 'paused' } });
    expect(notificationEffect(n('CONVERSATION_RESUMED'))).toMatchObject({ refreshState: true, toast: { type: 'success' } });
  });

  it('a hook request re-reads the requests and never names the sender', () => {
    const e = notificationEffect(n('HOOK_REQUESTED'));
    expect(e.refreshRequests).toBe(true);
    expect(e.toast?.message).toBe('Someone sent you a hook request.');
  });

  it('the draft reminder re-reads the profile', () => {
    expect(notificationEffect(n('MATCHING_DRAFT_EXPIRING'))).toMatchObject({ refreshProfile: true });
  });

  it('a new hook refreshes the chat list; unknown kinds do nothing', () => {
    const hooked = notificationEffect(n('MUTUAL_MATCH'));
    expect(hooked.refreshState).toBe(true);
    expect(hooked.toast).toBeUndefined();
    expect(notificationEffect(n('SOMETHING_ELSE'))).toEqual({ refreshState: false, refreshRequests: false, refreshProfile: false });
  });
});
