import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: async () => ({ tokens: { idToken: { toString: () => 'jwt-abc' } } }),
}));

describe('Owner photo stats API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the caller’s own stats without sending any user id, authenticated by the JWT', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ photos: [{ mediaId: 'media/u1/a.jpg', uniqueViewers: 3, fullscreenViewers: 1 }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { hostname: 'app.gamma.onehook.club', origin: 'https://app.gamma.onehook.club' } });
    const { getMyPhotoStats } = await import('../api/analytics');

    const stats = await getMyPhotoStats();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/signals/media-stats')).toBe(true);
    expect(url).not.toMatch(/userId|u1/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-abc');
    expect(stats['media/u1/a.jpg'].uniqueViewers).toBe(3);
  });

  it('surfaces a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    vi.stubGlobal('window', { location: { hostname: 'x', origin: 'https://x' } });
    const { getMyPhotoStats } = await import('../api/analytics');
    await expect(getMyPhotoStats()).rejects.toThrow(/401/);
  });
});

describe('Full-screen signal', () => {
  it('records media_fullscreen_open as an image interaction', async () => {
    const analytics = await import('../lib/analytics/analytics');
    const client = analytics.getAnalytics();
    const spy = vi.spyOn(client, 'track');
    analytics.trackMediaFullscreenOpen('media/u2/p.jpg', { index: 1, viewedUserId: 'u2', context: 'DISCOVER' });
    expect(spy).toHaveBeenCalledWith('media_fullscreen_open', {
      mediaId: 'media/u2/p.jpg',
      mediaType: 'image',
      index: 1,
      viewedUserId: 'u2',
      context: 'DISCOVER',
    });
  });
});
