import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The sharer's GraphQL calls (api/live-location.ts): every selection carries the seven
 * LiveLocationUpdate fields (subscribers only get what the mutation selected), errors keep their
 * errorType, and the best-effort stop sent from `pagehide` as a keepalive fetch.
 */

const mocks = vi.hoisted(() => ({
  graphql: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock('../api/chat', () => ({ appSyncClient: () => ({ graphql: mocks.graphql }) }));
vi.mock('aws-amplify', () => ({
  Amplify: { getConfig: () => ({ API: { GraphQL: { endpoint: 'https://chat.example.test/graphql' } } }) },
}));
vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: mocks.fetchAuthSession }));

import { GraphQLOperationError } from '../api/graphql-error';
import { LiveLocationApi, PUBLISH_LIVE_LOCATION, STOP_LIVE_LOCATION } from '../api/live-location';

const MATCH = 'match-1';
const SESSION = '3f6d2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';
const NOW = 1_794_700_000_000;
const ROW = { matchId: MATCH, userId: 'me', sessionId: SESSION, ciphertext: 'c', at: NOW, expiresAt: NOW + 60_000, ended: false };

function session(expSeconds: number) {
  return { tokens: { accessToken: { toString: () => 'jwt-access', payload: { exp: expSeconds } } } };
}

const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));

beforeEach(() => {
  mocks.graphql.mockReset();
  mocks.fetchAuthSession.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  LiveLocationApi.clearUnloadAuth();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selection sets', () => {
  it.each([
    ['publishLiveLocation', PUBLISH_LIVE_LOCATION],
    ['stopLiveLocation', STOP_LIVE_LOCATION],
  ])('%s selects all seven LiveLocationUpdate fields', (_name, query) => {
    for (const field of ['matchId', 'userId', 'sessionId', 'ciphertext', 'at', 'expiresAt', 'ended']) {
      expect(query).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });
});

describe('publish and stop', () => {
  it('publishes the sealed update with the share expiry, returns the row, and refreshes the unload token', async () => {
    mocks.graphql.mockResolvedValue({ data: { publishLiveLocation: ROW } });
    // Rejecting keeps this test's token refresh from leaking a token copy into the next tests.
    mocks.fetchAuthSession.mockRejectedValue(new Error('not needed here'));
    await expect(LiveLocationApi.publishLiveLocation(MATCH, SESSION, 'sealed', NOW + 60_000)).resolves.toEqual(ROW);
    expect(mocks.graphql).toHaveBeenCalledWith({
      query: PUBLISH_LIVE_LOCATION,
      variables: { matchId: MATCH, sessionId: SESSION, ciphertext: 'sealed', expiresAt: NOW + 60_000 },
    });
    await vi.waitFor(() => expect(mocks.fetchAuthSession).toHaveBeenCalled());
  });

  it('keeps the server errorType (the sharer acts on it)', async () => {
    mocks.graphql.mockRejectedValue({ data: null, errors: [{ message: 'too soon', errorType: 'Throttled' }] });
    const err = await LiveLocationApi.publishLiveLocation(MATCH, SESSION, 'sealed', NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphQLOperationError);
    expect((err as GraphQLOperationError).errorType).toBe('Throttled');
  });

  it('stops one share', async () => {
    mocks.graphql.mockResolvedValue({ data: { stopLiveLocation: { ...ROW, ciphertext: null, ended: true } } });
    await expect(LiveLocationApi.stopLiveLocation(MATCH, SESSION)).resolves.toMatchObject({ ended: true });
    expect(mocks.graphql).toHaveBeenCalledWith({ query: STOP_LIVE_LOCATION, variables: { matchId: MATCH, sessionId: SESSION } });
  });
});

describe('the stop sent while the tab closes', () => {
  it('is not attempted before a token copy exists', () => {
    expect(LiveLocationApi.stopOnUnload(MATCH, SESSION, NOW)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts stopLiveLocation as a keepalive fetch with the access token', async () => {
    mocks.fetchAuthSession.mockResolvedValue(session(NOW / 1000 + 3600));
    await LiveLocationApi.primeUnloadAuth();
    expect(LiveLocationApi.stopOnUnload(MATCH, SESSION, NOW)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://chat.example.test/graphql');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    expect(init.headers).toMatchObject({ Authorization: 'jwt-access', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ query: STOP_LIVE_LOCATION, variables: { matchId: MATCH, sessionId: SESSION } });
  });

  it('is not attempted with a token about to expire, or after sign-out cleared it', async () => {
    mocks.fetchAuthSession.mockResolvedValue(session(NOW / 1000 + 5));
    await LiveLocationApi.primeUnloadAuth();
    expect(LiveLocationApi.stopOnUnload(MATCH, SESSION, NOW)).toBe(false);

    mocks.fetchAuthSession.mockResolvedValue(session(NOW / 1000 + 3600));
    await LiveLocationApi.primeUnloadAuth();
    LiveLocationApi.clearUnloadAuth();
    expect(LiveLocationApi.stopOnUnload(MATCH, SESSION, NOW)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws when the session cannot be read', async () => {
    mocks.fetchAuthSession.mockRejectedValue(new Error('signed out'));
    await expect(LiveLocationApi.primeUnloadAuth()).resolves.toBeUndefined();
    expect(LiveLocationApi.stopOnUnload(MATCH, SESSION, NOW)).toBe(false);
  });
});
