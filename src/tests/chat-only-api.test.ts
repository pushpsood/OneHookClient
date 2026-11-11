import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The State / Profile / Matching wrappers against a fake generated SDK: which operation each call
 * uses, which pass it sends as X-View-Pass, and the retries the contract asks for
 * (docs/chat-only-profiles-implementation.md §1, design §9).
 */
const sdk = vi.hoisted(() => ({
  getState: vi.fn(),
  sendHookRequest: vi.fn(),
  listHookRequests: vi.fn(),
  acceptHookRequest: vi.fn(),
  declineHookRequest: vi.fn(),
  cancelHookRequest: vi.fn(),
  keepHooks: vi.fn(),
  blockUser: vi.fn(),
  reportMember: vi.fn(),
  enableMatching: vi.fn(),
  disableMatching: vi.fn(),
  getChatProfile: vi.fn(),
  getMatchingProfile: vi.fn(),
  generateDownloadUrl: vi.fn(),
  generateUploadUrl: vi.fn(),
  upsertChatProfile: vi.fn(),
  upsertMatchingProfile: vi.fn(),
  getMyProfile: vi.fn(),
  discover: vi.fn(),
  issueViewPasses: vi.fn(),
  indexLocation: vi.fn(),
}));
vi.mock('../api/sdk-client', () => ({ sdkClient: sdk }));

import { StateApi, DISABLE_MATCHING_CONFIRMATION, HOOK_REQUEST_SENT_CONFIRMATION } from '../api/state';
import { ProfileApi } from '../api/profile';
import { MatchingApi } from '../api/matching';
import { setViewPassRefresher, viewPasses } from '../lib/view-pass';

function pass(aud: 'profile.chat' | 'profile.matching', tgt: string[]): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${enc({ alg: 'ES256' })}.${enc({ aud, sub: 'me', tgt, iat: now, exp: now + 600 })}.sig`;
}

/** What the SDK throws for `{error, code}`: name = code, body fields copied, message = "UnknownError". */
const sdkError = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error('UnknownError'), {
    name: code,
    error: `${code} (test)`,
    code,
    $metadata: { httpStatusCode: status },
    ...extra,
  });

beforeEach(() => {
  Object.values(sdk).forEach((fn) => fn.mockReset());
  viewPasses.clear();
  setViewPassRefresher('profile.chat', undefined);
  setViewPassRefresher('profile.matching', undefined);
});

describe('StateApi', () => {
  it('getUserState normalises the response and remembers the chat view pass', async () => {
    const chatViewPass = pass('profile.chat', ['partner']);
    sdk.getState.mockResolvedValue({
      userId: 'me',
      state: 'HOOKED',
      activeConnections: 1,
      matchIds: ['m1'],
      subscriptionTier: 'MUST',
      hooks: [{ matchId: 'm1', peerId: 'partner', origin: 'REQUEST', hookedAt: 1 }],
      effectiveCapacity: 1,
      matching: { status: 'OFF', generation: 0 },
      chatViewPass,
    });
    const snap = await StateApi.getUserState('me');
    expect(sdk.getState).toHaveBeenCalledWith({ userId: 'me' });
    expect(snap.hooks[0].peerId).toBe('partner');
    expect(viewPasses.passFor('profile.chat', 'partner')).toBe(chatViewPass);
  });

  it('retries a 503 VIEW_PASS_UNAVAILABLE (KMS signing failed) and nothing else', async () => {
    vi.useFakeTimers();
    sdk.getState
      .mockRejectedValueOnce(sdkError(503, 'VIEW_PASS_UNAVAILABLE'))
      .mockResolvedValueOnce({ userId: 'me', state: 'AVAILABLE', activeConnections: 0, matchIds: [], subscriptionTier: 'MUST' });
    const pending = StateApi.getUserState('me');
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toMatchObject({ state: 'AVAILABLE' });
    expect(sdk.getState).toHaveBeenCalledTimes(2);

    sdk.getState.mockReset().mockRejectedValue(sdkError(500, 'INTERNAL_ERROR'));
    await expect(StateApi.getUserState('me')).rejects.toThrow();
    expect(sdk.getState).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('sends a hook request by username through POST /state/hook-requests', async () => {
    sdk.sendHookRequest.mockResolvedValue({ status: 'REQUEST_SENT' });
    await StateApi.sendHookRequest('bob');
    expect(sdk.sendHookRequest).toHaveBeenCalledWith({ username: 'bob' });
    // One constant confirmation for every recipient outcome (R4): it names nobody.
    expect(HOOK_REQUEST_SENT_CONFIRMATION).not.toMatch(/bob|exist|found|blocked/i);
  });

  it('lists incoming requests and remembers the pass for the unlocked senders', async () => {
    const chatViewPass = pass('profile.chat', ['carol']);
    sdk.listHookRequests.mockResolvedValue({
      direction: 'INCOMING',
      requests: [
        { requestId: 'r1', createdAt: 1, expiresAt: 2, locked: false, fromUserId: 'carol' },
        { requestId: 'r2', createdAt: 1, expiresAt: 2, locked: true },
      ],
      chatViewPass,
    });
    const res = await StateApi.listIncomingRequests();
    expect(sdk.listHookRequests).toHaveBeenCalledWith({ direction: 'INCOMING' });
    expect(res.requests).toHaveLength(2);
    expect(viewPasses.passFor('profile.chat', 'carol')).toBe(chatViewPass);
  });

  it('accept, decline and cancel address the request by id', async () => {
    sdk.acceptHookRequest.mockResolvedValue({ matchId: 'm9', peerId: 'carol' });
    await expect(StateApi.acceptHookRequest('r1')).resolves.toEqual({ matchId: 'm9', peerId: 'carol' });
    await StateApi.declineHookRequest('r2');
    await StateApi.cancelHookRequest('r3');
    expect(sdk.acceptHookRequest).toHaveBeenCalledWith({ requestId: 'r1' });
    expect(sdk.declineHookRequest).toHaveBeenCalledWith({ requestId: 'r2' });
    expect(sdk.cancelHookRequest).toHaveBeenCalledWith({ requestId: 'r3' });
  });

  it('blocks and reports through State (Matching no longer owns them)', async () => {
    sdk.reportMember.mockResolvedValue({ reportId: 'rep', severity: 'standard', evidenceAllowed: true });
    await StateApi.blockUser('bob', 'SPAM');
    await StateApi.reportMember({ reportedUserId: 'bob', category: 'SPAM_PROMOTION', evidenceOffered: false });
    expect(sdk.blockUser).toHaveBeenCalledWith({ blockedUserId: 'bob', reason: 'SPAM', details: undefined });
    expect(sdk.reportMember).toHaveBeenCalledWith(expect.objectContaining({ reportedUserId: 'bob' }));
  });

  it('turns matching off with the exact confirmation phrase State requires', async () => {
    await StateApi.disableMatching();
    expect(DISABLE_MATCHING_CONFIRMATION).toBe('ERASE_MATCHING');
    expect(sdk.disableMatching).toHaveBeenCalledWith({ confirm: 'ERASE_MATCHING' });
  });

  it('keeps hooks after a downgrade with POST /state/hooks/keep', async () => {
    sdk.keepHooks.mockResolvedValue({ userId: 'me', state: 'HOOKED', activeConnections: 1, matchIds: ['m1'], subscriptionTier: 'MUST' });
    const snap = await StateApi.keepHooks(['m1']);
    expect(sdk.keepHooks).toHaveBeenCalledWith({ matchIds: ['m1'] });
    expect(snap.selectionRequired).toBe(false);
  });
});

describe('ProfileApi', () => {
  it('reads a partner chat profile with the State pass as X-View-Pass', async () => {
    const chat = pass('profile.chat', ['partner']);
    viewPasses.add(chat);
    sdk.getChatProfile.mockResolvedValue({ userId: 'partner', displayName: 'Bo' });
    await ProfileApi.getChat('partner');
    expect(sdk.getChatProfile).toHaveBeenCalledWith({ userId: 'partner', viewPass: chat });
  });

  it('on a 404 re-fetches the pass (refresher) and retries once', async () => {
    const fresh = pass('profile.chat', ['partner']);
    const refresher = vi.fn(async () => viewPasses.add(fresh));
    setViewPassRefresher('profile.chat', refresher);
    sdk.getChatProfile.mockImplementation(async ({ viewPass }: { viewPass?: string }) => {
      if (viewPass !== fresh) throw sdkError(404, 'NOT_FOUND');
      return { userId: 'partner' };
    });
    await expect(ProfileApi.getChat('partner')).resolves.toEqual({ userId: 'partner' });
    expect(refresher).toHaveBeenCalled();
  });

  it('reads a candidate matching profile with the Matching pass', async () => {
    const m = pass('profile.matching', ['cand']);
    viewPasses.add(m);
    sdk.getMatchingProfile.mockResolvedValue({ userId: 'cand' });
    await ProfileApi.getMatching('cand');
    expect(sdk.getMatchingProfile).toHaveBeenCalledWith({ userId: 'cand', viewPass: m });
  });

  it('signs media downloads with the pass of the profile the key belongs to', async () => {
    const chat = pass('profile.chat', ['u1']);
    const matching = pass('profile.matching', ['u2']);
    viewPasses.add(chat);
    viewPasses.add(matching);
    sdk.generateDownloadUrl.mockResolvedValue({ downloadUrl: 'https://s3/x', expiresInSeconds: 300 });
    await ProfileApi.getDownloadUrl('media/u1/chat/a.jpg');
    await ProfileApi.getDownloadUrl('media/u2/matching/b.jpg');
    await ProfileApi.getDownloadUrl('media/me/chat/own.jpg');
    expect(sdk.generateDownloadUrl.mock.calls.map((c) => c[0])).toEqual([
      { key: 'media/u1/chat/a.jpg', viewPass: chat },
      { key: 'media/u2/matching/b.jpg', viewPass: matching },
      { key: 'media/me/chat/own.jpg', viewPass: undefined },
    ]);
  });

  it('uploads media with a purpose, so only matching media is erased on opt-out', async () => {
    sdk.generateUploadUrl.mockResolvedValue({ uploadUrl: 'https://s3/up', objectKey: 'pending/me/chat/k' });
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    // Node has no FileReader, so the local preview is skipped (and warned about); not under test.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const key = await ProfileApi.uploadMedia(new Blob(['x'], { type: 'image/png' }), 'CHAT');
    warn.mockRestore();
    expect(key).toBe('pending/me/chat/k');
    expect(sdk.generateUploadUrl).toHaveBeenCalledWith({ contentType: 'image/png', contentLength: 1, purpose: 'CHAT' });
    vi.unstubAllGlobals();
  });

  it('writes the chat and matching profiles to their own routes', async () => {
    sdk.upsertMatchingProfile.mockResolvedValue({ status: 'DRAFT', lastEditedAt: 1, draftExpiresAt: 2 });
    await ProfileApi.upsertChat({ displayName: 'A' });
    await expect(ProfileApi.upsertMatching({ bio: 'b' })).resolves.toEqual({ status: 'DRAFT', lastEditedAt: 1, draftExpiresAt: 2 });
    expect(sdk.upsertChatProfile).toHaveBeenCalledWith({ displayName: 'A' });
    expect(sdk.upsertMatchingProfile).toHaveBeenCalledWith({ bio: 'b' });
  });
});

describe('MatchingApi', () => {
  it('discover remembers the page view pass and never sends a user id', async () => {
    const page = pass('profile.matching', ['c1']);
    sdk.discover.mockResolvedValue({ candidates: [{ userId: 'c1' }], viewPass: page, count: 1, algorithm: 'x' });
    await MatchingApi.discover(1, 2);
    expect(sdk.discover).toHaveBeenCalledWith({ lat: 1, lon: 2 });
    expect(viewPasses.passFor('profile.matching', 'c1')).toBe(page);
  });

  it('re-issues passes for at most 25 members', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    sdk.issueViewPasses.mockResolvedValue({ targetIds: ids.slice(0, 25), viewPass: pass('profile.matching', ids.slice(0, 25)) });
    await MatchingApi.issueViewPasses(ids);
    expect(sdk.issueViewPasses.mock.calls[0][0].targetIds).toHaveLength(25);
    expect(viewPasses.passFor('profile.matching', 'u3')).toBeDefined();
  });
});
