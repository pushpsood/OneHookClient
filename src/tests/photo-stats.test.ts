import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: async () => ({ tokens: { idToken: { toString: () => 'jwt-abc' } } }),
}));

describe('Owner photo stats API (GetMediaStats through the SDK)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks for the caller’s own stats with no input (the owner is the JWT subject)', async () => {
    const { sdkClient } = await import('../api/sdk-client');
    const spy = vi.spyOn(sdkClient, 'getMediaStats').mockResolvedValue({
      $metadata: {},
      photos: [
        {
          mediaId: 'media/u1/a.jpg',
          uniqueViewers: 3,
          viewersMoreThanOnce: 2,
          viewersMoreThan10: 1,
          viewersMoreThan100: 0,
          fullscreenViewers: 1,
          totalViews: 9,
          totalFullscreenOpens: 1,
        },
      ],
    } as never);
    const { getMyPhotoStats } = await import('../api/analytics');

    const stats = await getMyPhotoStats();

    expect(spy).toHaveBeenCalledWith({});
    // The generated PhotoStats model, keyed by mediaId.
    expect(stats['media/u1/a.jpg']).toMatchObject({ uniqueViewers: 3, viewersMoreThan10: 1, totalViews: 9 });
  });

  it('surfaces a server error as an ApiError with the status', async () => {
    const { sdkClient } = await import('../api/sdk-client');
    vi.spyOn(sdkClient, 'getMediaStats').mockRejectedValue(
      Object.assign(new Error('UnknownError'), { $metadata: { httpStatusCode: 401 } })
    );
    const { getMyPhotoStats } = await import('../api/analytics');
    await expect(getMyPhotoStats()).rejects.toMatchObject({ name: 'ApiError', status: 401 });
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
