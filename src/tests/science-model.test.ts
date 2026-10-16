import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  classifyIntent,
  composeProfileText,
  cosine,
  deckPacing,
  embed,
  profileViewScore,
  replyScore,
  swipeScore,
} from '../components/science/science-model';

/**
 * The /science page promises "every rule on this page is a rule in the code". These tests pin the
 * browser port to the production engines in OnehookIntelligence (scoring.py, intent.py,
 * analyzers.py, pubsub.tf), so the explainer cannot silently drift from the real behaviour.
 */

describe('profileViewScore (ProfileViewScorer)', () => {
  it('weights 35/25/20/20 and caps every component', () => {
    const full = profileViewScore({ dwellSeconds: 600, photosViewed: 9, totalPhotos: 6, bioExpanded: true, promptsRead: 9 });
    expect(full.total).toBeCloseTo(1, 10);
    expect(full.time).toBeCloseTo(0.35, 10);
  });

  it('log-scales dwell against a 60 s cap', () => {
    const s = profileViewScore({ dwellSeconds: 18, photosViewed: 0, totalPhotos: 6, bioExpanded: false, promptsRead: 0 });
    expect(s.total).toBeCloseTo((0.35 * Math.log1p(18)) / Math.log1p(60), 10);
  });

  it('scores zero photo depth when the profile has no photos', () => {
    expect(profileViewScore({ dwellSeconds: 0, photosViewed: 3, totalPhotos: 0, bioExpanded: false, promptsRead: 0 }).photos).toBe(0);
  });
});

describe('swipeScore (SwipeScorer)', () => {
  it('maps decisions and deliberation latency', () => {
    expect(swipeScore('SUPER_LIKE', 0)).toBe(1);
    expect(swipeScore('PASS', 9000)).toBe(0);
    expect(swipeScore('LIKE', 0)).toBeCloseTo(0.5);
    expect(swipeScore('LIKE', 2500)).toBeCloseTo(0.7);
    expect(swipeScore('LIKE', 60000)).toBeCloseTo(0.9);
  });
});

describe('replyScore (ChatScorer)', () => {
  it('is 1 within 5 minutes, 0.2 at 24 h+, 0.7 for an opener', () => {
    expect(replyScore(60_000)).toBe(1);
    expect(replyScore(5 * 60_000)).toBe(1);
    expect(replyScore(24 * 3600_000)).toBe(0.2);
    expect(replyScore(72 * 3600_000)).toBe(0.2);
    expect(replyScore(null)).toBe(0.7);
  });

  it('decays log-linearly in between and rounds to 4 places', () => {
    const ms = 60 * 60_000;
    const frac = Math.log(ms / (5 * 60_000)) / Math.log((24 * 3600_000) / (5 * 60_000));
    expect(replyScore(ms)).toBe(Math.round((1 - 0.8 * frac) * 10000) / 10000);
  });
});

describe('classifyIntent (IntentClassifier)', () => {
  it('falls back to casual at neutral confidence with no evidence', () => {
    expect(classifyIntent([])).toEqual({ intent: 'CASUAL', confidence: 0.5, average: null });
  });

  it('is serious only strictly above the 0.6 threshold', () => {
    expect(classifyIntent([0.6]).intent).toBe('CASUAL');
    expect(classifyIntent([1, 1]).intent).toBe('SERIOUS');
    expect(classifyIntent([1]).confidence).toBe(1);
    expect(classifyIntent([0]).confidence).toBe(1);
    expect(classifyIntent([0.8]).confidence).toBe(0.8);
  });
});

describe('deckPacing (behavioral analyzers + defaults)', () => {
  it('needs both speed and volume for mass swiping', () => {
    expect(deckPacing({ swipesPerMinute: 30, swipesInWindow: 9, minutesToday: 0 }).pacing).toBe('NORMAL');
    expect(deckPacing({ swipesPerMinute: 19, swipesInWindow: 40, minutesToday: 0 }).pacing).toBe('NORMAL');
    expect(deckPacing({ swipesPerMinute: 20, swipesInWindow: 10, minutesToday: 0 }).pacing).toBe('SLOW_DOWN');
  });

  it('lets macro fatigue (2 h/day) win over mass swiping', () => {
    expect(deckPacing({ swipesPerMinute: 40, swipesInWindow: 40, minutesToday: 120 }).pacing).toBe('BREAK_SUGGESTED');
    expect(deckPacing({ swipesPerMinute: 0, swipesInWindow: 0, minutesToday: 119 }).pacing).toBe('NORMAL');
  });
});

describe('ROUTES (Pub/Sub subscription filters)', () => {
  it('matches the per-engine event filters, with erasure reaching every engine', () => {
    expect(ROUTES.view).toEqual(['engagement']);
    expect(ROUTES.swipe).toEqual(['engagement', 'rhythm']);
    expect(ROUTES.session).toEqual(['engagement', 'rhythm']);
    expect(ROUTES.chat).toEqual(['engagement']);
    expect(ROUTES.profile).toEqual(['meaning']);
    expect(ROUTES.erase).toEqual(['engagement', 'rhythm', 'meaning']);
  });
});

describe('illustrative embedding', () => {
  it('is deterministic, unit length, and self-similar', () => {
    const a = embed('sunrise hikes and filter coffee');
    expect(embed('sunrise hikes and filter coffee')).toEqual(a);
    expect(Math.sqrt(a.reduce((s, v) => s + v * v, 0))).toBeCloseTo(1, 10);
    expect(cosine(a, a)).toBeCloseTo(1, 10);
  });

  it('scores overlapping profiles closer than unrelated ones', () => {
    const base = embed(composeProfileText('I love hiking and coffee', ['hiking', 'coffee'], []));
    const near = embed(composeProfileText('Hiking every weekend, coffee after', ['hiking', 'coffee'], []));
    const far = embed(composeProfileText('Competitive chess and jazz piano', ['chess', 'jazz'], []));
    expect(cosine(base, near)).toBeGreaterThan(cosine(base, far));
  });

  it('returns a zero vector (similarity 0) for empty text', () => {
    expect(cosine(embed(''), embed('anything'))).toBe(0);
  });
});
