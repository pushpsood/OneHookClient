import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ViewPassStore,
  batchRefresher,
  decodeViewPass,
  mediaKeyOwner,
  setViewPassRefresher,
  withViewPass,
} from '../lib/view-pass';

/** A view pass as State / Matching mint it (contract §1); only the payload matters to the client. */
function pass(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'ES256', typ: 'vp+jwt', kid: 'arn:aws:kms:x' })}.${enc(payload)}.sig`;
}

const NOW = 1_767_000_000;
const chatPass = (tgt: string[], exp = NOW + 600) =>
  pass({ iss: 'state', aud: 'profile.chat', sub: 'me', tgt, iat: NOW, exp });
const matchingPass = (tgt: string[], exp = NOW + 600) =>
  pass({ iss: 'matching', aud: 'profile.matching', sub: 'me', tgt, iat: NOW, exp });

const notFound = () => Object.assign(new Error('not found'), { $metadata: { httpStatusCode: 404 } });

afterEach(() => {
  setViewPassRefresher('profile.chat', undefined);
  setViewPassRefresher('profile.matching', undefined);
  vi.useRealTimers();
});

describe('decodeViewPass', () => {
  it('reads aud, sub, tgt and exp from the payload', () => {
    const token = chatPass(['p1', 'p2']);
    expect(decodeViewPass(token)).toEqual({ token, aud: 'profile.chat', sub: 'me', tgt: ['p1', 'p2'], exp: NOW + 600 });
  });

  it('rejects anything that is not a view pass', () => {
    expect(decodeViewPass(undefined)).toBeNull();
    expect(decodeViewPass('not-a-jws')).toBeNull();
    expect(decodeViewPass(pass({ aud: 'something.else', tgt: [] }))).toBeNull();
    expect(decodeViewPass('a.%%%.c')).toBeNull();
  });
});

describe('ViewPassStore', () => {
  it('finds the pass of the right audience naming the target', () => {
    const store = new ViewPassStore(() => NOW);
    store.add(chatPass(['p1']));
    store.add(matchingPass(['c1']));
    expect(store.passFor('profile.chat', 'p1')).toBe(chatPass(['p1']));
    expect(store.passFor('profile.matching', 'p1')).toBeUndefined();
    expect(store.passFor('profile.matching', 'c1')).toBe(matchingPass(['c1']));
  });

  it('does not use a pass about to expire (it could lapse in flight)', () => {
    const store = new ViewPassStore(() => NOW);
    store.add(chatPass(['p1'], NOW + 5));
    expect(store.passFor('profile.chat', 'p1')).toBeUndefined();
  });

  it('prefers the newest pass and can drop one audience', () => {
    const store = new ViewPassStore(() => NOW);
    const older = chatPass(['p1'], NOW + 300);
    const newer = chatPass(['p1', 'p2'], NOW + 600);
    store.add(older);
    store.add(newer);
    expect(store.passFor('profile.chat', 'p1')).toBe(newer);
    store.add(matchingPass(['c1']));
    store.clear('profile.matching');
    expect(store.passFor('profile.matching', 'c1')).toBeUndefined();
    expect(store.passFor('profile.chat', 'p2')).toBe(newer);
  });
});

describe('withViewPass', () => {
  it('fetches a pass first when none is held, then reads with it', async () => {
    const store = new ViewPassStore(() => NOW);
    const refresher = vi.fn(async () => store.add(chatPass(['p1'])));
    setViewPassRefresher('profile.chat', refresher);
    const read = vi.fn(async (p?: string) => p);
    await expect(withViewPass('profile.chat', 'p1', read, store)).resolves.toBe(chatPass(['p1']));
    expect(refresher).toHaveBeenCalledWith(['p1']);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('on a 404 refreshes the pass once and retries', async () => {
    const store = new ViewPassStore(() => NOW);
    const stale = chatPass(['p1'], NOW + 300);
    const fresh = chatPass(['p1'], NOW + 600);
    store.add(stale);
    setViewPassRefresher('profile.chat', async () => store.add(fresh));
    const read = vi.fn(async (p?: string) => {
      if (p === stale) throw notFound();
      return 'profile';
    });
    await expect(withViewPass('profile.chat', 'p1', read, store)).resolves.toBe('profile');
    expect(read.mock.calls.map((c) => c[0])).toEqual([stale, fresh]);
  });

  it('a second 404 is the answer (no pass covers them: unknown, unhooked or blocked)', async () => {
    const store = new ViewPassStore(() => NOW);
    store.add(chatPass(['p1']));
    setViewPassRefresher('profile.chat', async () => undefined);
    const read = vi.fn(async () => {
      throw notFound();
    });
    await expect(withViewPass('profile.chat', 'p1', read, store)).rejects.toThrow('not found');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('any other failure propagates without a refresh', async () => {
    const store = new ViewPassStore(() => NOW);
    store.add(chatPass(['p1']));
    const refresher = vi.fn(async () => undefined);
    setViewPassRefresher('profile.chat', refresher);
    await expect(
      withViewPass('profile.chat', 'p1', async () => {
        throw Object.assign(new Error('boom'), { status: 500 });
      }, store)
    ).rejects.toThrow('boom');
    expect(refresher).not.toHaveBeenCalled();
  });
});

describe('batchRefresher', () => {
  it('coalesces refreshes made together into one call of at most 25 ids', async () => {
    vi.useFakeTimers();
    const fetchPasses = vi.fn(async (_ids: string[]) => undefined);
    const refresh = batchRefresher(fetchPasses, 25, 10);
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    const all = Promise.all(ids.map((id) => refresh([id])));
    await vi.advanceTimersByTimeAsync(10);
    await all;
    expect(fetchPasses).toHaveBeenCalledTimes(2);
    expect(fetchPasses.mock.calls[0][0]).toHaveLength(25);
    expect(fetchPasses.mock.calls[1][0]).toHaveLength(5);
  });
});

describe('mediaKeyOwner', () => {
  it('maps media keys to the pass that opens them', () => {
    expect(mediaKeyOwner('media/u1/chat/abc.jpg')).toEqual({ ownerId: 'u1', aud: 'profile.chat' });
    expect(mediaKeyOwner('media/u1/matching/abc.jpg')).toEqual({ ownerId: 'u1', aud: 'profile.matching' });
    expect(mediaKeyOwner('pending/u1/matching/abc.jpg')).toEqual({ ownerId: 'u1', aud: 'profile.matching' });
    expect(mediaKeyOwner('media/u1/abc.jpg')).toEqual({ ownerId: 'u1', aud: null });
    expect(mediaKeyOwner('https://example.com/a.jpg')).toBeNull();
  });
});
