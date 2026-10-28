/**
 * Browser-side model of OneHook Intelligence, used only by the /science explainer page.
 *
 * Every formula here is a faithful port of the production engines in OnehookIntelligence, so the
 * interactive demos show the real behaviour rather than a marketing approximation:
 *
 *  - profileViewScore / swipeScore / replyScore -> intelligence_engine/services/scoring.py
 *  - classifyIntent                             -> intelligence_engine/services/intent.py
 *  - deckPacing                                 -> behavioral_engine/services/analyzers.py (+ config defaults)
 *  - ROUTES                                     -> infra/pubsub.tf subscription filters
 *
 * Taste and Wish are the two halves of Mr. OneHook in OneHook Matching (OneHookBackend):
 *
 *  - inclinationCount / clusterInclinations     -> matching service/suggestion/InclinationClustering.java
 *  - inferInclinations / inclinationReasoning   -> matching service/suggestion/SuggestionInferenceJob.java
 *  - mixDeck                                    -> matching service/discovery/DiscoveryFeedService.interleave
 *
 * Tradition is OneHook Matching's traditional (cosmic) compatibility:
 *
 *  - TRADITIONAL_SYSTEMS                        -> matching cosmic/TraditionalComparisonEngine.SYSTEMS
 *                                                  (availability measured by running the real
 *                                                  CosmicChartCalculator on random pairs)
 *
 * The one deliberate exception is `embed`: production uses a sentence-transformers model on the
 * server; the page uses a tiny feature-hashing embedding (the shape of the engine's own `hashing`
 * provider) so the demo runs entirely in the visitor's browser and nothing typed leaves the page.
 *
 * Keep this file pure (no React, no DOM) so src/tests/science-model.test.ts can pin the numbers.
 */

// ── Chapter 1 · Signal ────────────────────────────────────────────────────────

export interface ProfileViewInput {
  dwellSeconds: number;
  photosViewed: number;
  totalPhotos: number;
  bioExpanded: boolean;
  promptsRead: number;
}

export interface ProfileViewBreakdown {
  time: number;
  photos: number;
  bio: number;
  prompts: number;
  total: number;
}

/** 35% dwell (log-scaled, 60 s cap) · 25% photo depth · 20% bio · 20% prompts (3 cap). */
export function profileViewScore(input: ProfileViewInput): ProfileViewBreakdown {
  const dwell = Math.max(0, input.dwellSeconds);
  const timeComponent = Math.min(Math.log1p(dwell) / Math.log1p(60), 1);
  const photoDepth = input.totalPhotos > 0 ? Math.min(Math.max(0, input.photosViewed) / input.totalPhotos, 1) : 0;
  const bio = input.bioExpanded ? 1 : 0;
  const prompts = Math.min(Math.max(0, input.promptsRead) / 3, 1);
  const time = 0.35 * timeComponent;
  const photos = 0.25 * photoDepth;
  const bioPart = 0.2 * bio;
  const promptsPart = 0.2 * prompts;
  return { time, photos, bio: bioPart, prompts: promptsPart, total: time + photos + bioPart + promptsPart };
}

// ── Chapter 3 · Engagement ────────────────────────────────────────────────────

export type SwipeDecision = 'PASS' | 'LIKE' | 'SUPER_LIKE';

/** SUPER_LIKE = 1, PASS = 0, LIKE = 0.5..0.9 by deliberation latency (5 s cap). */
export function swipeScore(decision: SwipeDecision, latencyMs: number): number {
  if (decision === 'SUPER_LIKE') return 1;
  if (decision === 'PASS') return 0;
  const weight = Math.min(Math.max(0, latencyMs) / 5000, 1);
  return 0.5 + 0.4 * weight;
}

// ── Chapter 4 · Time ──────────────────────────────────────────────────────────

export const REPLY_FAST_MS = 5 * 60 * 1000;
export const REPLY_SLOW_MS = 24 * 60 * 60 * 1000;
/** A message with no reply latency is an opener or follow-up: taking initiative. */
export const OPENER_SCORE = 0.7;

/** 1.0 within 5 min, decaying log-linearly to 0.2 at 24 h and beyond. `null` = an opener. */
export function replyScore(latencyMs: number | null): number {
  if (latencyMs === null) return OPENER_SCORE;
  if (latencyMs <= REPLY_FAST_MS) return 1;
  if (latencyMs >= REPLY_SLOW_MS) return 0.2;
  const frac = Math.log(latencyMs / REPLY_FAST_MS) / Math.log(REPLY_SLOW_MS / REPLY_FAST_MS);
  return Math.round((1 - 0.8 * frac) * 10000) / 10000;
}

export type Intent = 'SERIOUS' | 'CASUAL';

export interface IntentResult {
  intent: Intent;
  confidence: number;
  average: number | null;
}

export const INTENT_THRESHOLD = 0.6;

/** Average of the user's own recent engagement scores against a 0.6 threshold. */
export function classifyIntent(scores: readonly number[], threshold = INTENT_THRESHOLD): IntentResult {
  if (scores.length === 0) return { intent: 'CASUAL', confidence: 0.5, average: null };
  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const serious = avg > threshold;
  const distance = serious ? (avg - threshold) / (1 - threshold) : (threshold - avg) / threshold;
  const confidence = Math.round((0.6 + 0.4 * Math.min(distance, 1)) * 100) / 100;
  return { intent: serious ? 'SERIOUS' : 'CASUAL', confidence, average: avg };
}

// ── Chapter 3 · Rhythm ────────────────────────────────────────────────────────

export const MASS_SWIPE_PER_MINUTE = 20;
export const MASS_SWIPE_MIN_SAMPLES = 10;
export const MACRO_FATIGUE_SECONDS = 2 * 3600;

export type DeckPacing = 'NORMAL' | 'SLOW_DOWN' | 'BREAK_SUGGESTED';

export interface PacingInput {
  swipesPerMinute: number;
  swipesInWindow: number;
  minutesToday: number;
}

export interface PacingResult {
  massSwiping: boolean;
  macroFatigue: boolean;
  pacing: DeckPacing;
}

/** Fatigue wins over mass swiping; otherwise the deck stays normal. */
export function deckPacing(input: PacingInput): PacingResult {
  const massSwiping = input.swipesInWindow >= MASS_SWIPE_MIN_SAMPLES && input.swipesPerMinute >= MASS_SWIPE_PER_MINUTE;
  const macroFatigue = input.minutesToday * 60 >= MACRO_FATIGUE_SECONDS;
  const pacing: DeckPacing = macroFatigue ? 'BREAK_SUGGESTED' : massSwiping ? 'SLOW_DOWN' : 'NORMAL';
  return { massSwiping, macroFatigue, pacing };
}

// ── Chapter 2 · Journey ───────────────────────────────────────────────────────

export type EngineId = 'engagement' | 'rhythm' | 'meaning' | 'taste' | 'wish' | 'tradition';
export type SignalKind = 'view' | 'swipe' | 'session' | 'chat' | 'profile' | 'ask' | 'birth' | 'erase';

/**
 * Which minds hear each event. Engagement, Rhythm and Meaning mirror the Pub/Sub filters; Taste
 * (inferred suggestions) learns only from likes, Wish only from what a member asks Mr OneHook in
 * their own chat with him (never from chats with matches), and Tradition only from birth details,
 * which are never forwarded to OnehookIntelligence. Erasure reaches every mind.
 */
export const ROUTES: Record<SignalKind, readonly EngineId[]> = {
  view: ['engagement'],
  swipe: ['engagement', 'rhythm', 'taste'],
  session: ['engagement', 'rhythm'],
  chat: ['engagement'],
  profile: ['meaning'],
  ask: ['wish'],
  birth: ['tradition'],
  erase: ['engagement', 'rhythm', 'meaning', 'taste', 'wish', 'tradition'],
};

// ── Chapter 3 · Meaning (illustrative embedding) ──────────────────────────────

const TOKEN = /[a-z0-9']+/g;

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Unit-length feature-hashing embedding over unigrams + bigrams (illustration only). */
export function embed(text: string, dimension = 96): number[] {
  const tokens = text.toLowerCase().match(TOKEN) ?? [];
  const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]} ${t}`)];
  const vector = new Array<number>(dimension).fill(0);
  for (const feature of features) {
    const h = fnv1a(feature);
    vector[h % dimension] += (h >>> 16) & 1 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  return norm ? vector.map((v) => v / norm) : vector;
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm ? Math.max(-1, Math.min(1, dot / norm)) : 0;
}

/** Bio + interests + prompts flattened into one document, as the ProfileTextComposer does. */
export function composeProfileText(bio: string, interests: readonly string[], prompts: readonly string[]): string {
  const parts: string[] = [];
  if (bio.trim()) parts.push(`Bio: ${bio.trim()}`);
  const cleaned = interests.map((i) => i.trim()).filter(Boolean);
  if (cleaned.length) parts.push(`Interests: ${cleaned.join(', ')}`);
  for (const p of prompts) if (p.trim()) parts.push(p.trim());
  return parts.join('\n');
}

// ── Chapter 3 · Taste (inferred suggestions: who you keep liking) ─────────────

export const TASTE_RECENT_LIKES = 50;
export const TASTE_MIN_LIKES = 3;
export const TASTE_MAX_INCLINATIONS = 3;
export const TASTE_MIN_CLUSTER = 3;
export const TASTE_FALLBACK_REASON = "Similar to people you've been liking";

/** About ten likes per inclination before OneHook splits them: clamp(likes / 10, 1, max). */
export function inclinationCount(likes: number, max = TASTE_MAX_INCLINATIONS): number {
  return Math.max(1, Math.min(max, Math.floor(likes / 10)));
}

function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) s += a[i] * b[i];
  return s;
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(dot(v, v));
  return norm ? v.map((x) => x / norm) : v;
}

/**
 * Spherical k-means over unit vectors (cosine). Deterministic: centroids are seeded farthest-first,
 * starting from the most recent point (index 0). Returns each non-empty cluster's member indices.
 */
export function clusterInclinations(points: readonly (readonly number[])[], k: number): number[][] {
  if (!points.length) return [];
  const kk = Math.max(1, Math.min(k, points.length));
  const centroids: number[][] = [normalize([...points[0]])];
  while (centroids.length < kk) {
    let far = -1;
    let worst = Number.POSITIVE_INFINITY;
    points.forEach((p, i) => {
      const bestSim = Math.max(...centroids.map((c) => dot(p, c)));
      if (bestSim < worst) {
        worst = bestSim;
        far = i;
      }
    });
    centroids.push(normalize([...points[far]]));
  }

  const assign = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < 10; iter += 1) {
    let changed = false;
    points.forEach((p, i) => {
      let best = 0;
      let bestSim = Number.NEGATIVE_INFINITY;
      centroids.forEach((c, ci) => {
        const sim = dot(p, c);
        if (sim > bestSim) {
          bestSim = sim;
          best = ci;
        }
      });
      if (iter === 0 || assign[i] !== best) {
        changed = changed || iter > 0;
        assign[i] = best;
      }
    });
    centroids.forEach((_, ci) => {
      const sum = new Array<number>(points[0].length).fill(0);
      let n = 0;
      points.forEach((p, i) => {
        if (assign[i] !== ci) return;
        p.forEach((x, d) => (sum[d] += x));
        n += 1;
      });
      if (n > 0) centroids[ci] = normalize(sum);
    });
    if (iter > 0 && !changed) break;
  }

  return centroids
    .map((_, ci) => assign.flatMap((a, i) => (a === ci ? [i] : [])))
    .filter((members) => members.length > 0);
}

/** "You've been liking people into hiking and reading", from the interests a cluster shares. */
export function inclinationReasoning(members: readonly (readonly string[])[]): string {
  const counts = new Map<string, number>();
  for (const interests of members) {
    for (const i of new Set(interests.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
      counts.set(i, (counts.get(i) ?? 0) + 1);
    }
  }
  const threshold = Math.max(2, Math.ceil(members.length * 0.4));
  const names = [...counts.entries()]
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 2)
    .map(([name]) => name);
  return names.length ? `You've been liking people into ${names.join(' and ')}` : TASTE_FALLBACK_REASON;
}

export interface LikedProfile {
  interests: readonly string[];
  vector: readonly number[];
}

export interface Inclination {
  /** Indices into the (most recent first) likes passed in. */
  members: number[];
  reasoning: string;
}

/** Recent likes (most recent first) → inclinations, largest first. Fewer than 3 likes: none yet. */
export function inferInclinations(likes: readonly LikedProfile[]): Inclination[] {
  const recent = likes.slice(0, TASTE_RECENT_LIKES);
  if (recent.length < TASTE_MIN_LIKES) return [];
  const k = inclinationCount(recent.length);
  return clusterInclinations(
    recent.map((l) => l.vector),
    k
  )
    .filter((m) => m.length >= Math.min(TASTE_MIN_CLUSTER, recent.length))
    .sort((a, b) => b.length - a.length)
    .map((members) => ({ members, reasoning: inclinationReasoning(members.map((i) => recent[i].interests)) }));
}

// ── Chapter 5 · One deck, two finders ─────────────────────────────────────────

export type MatchFinder = 'ONEHOOK_INTELLIGENCE' | 'MR_ONEHOOK';
/** Default share of the "For you" deck each finder fills. */
export const DECK_SHARES: Record<MatchFinder, number> = { ONEHOOK_INTELLIGENCE: 0.7, MR_ONEHOOK: 0.3 };

/**
 * Weighted interleave: each position goes to the finder furthest below its share; ties go to the
 * finder listed first (higher priority). A finder that runs dry drops out and the others backfill.
 */
export function mixDeck(
  sources: readonly { finder: MatchFinder; share: number; available: number }[],
  limit: number
): MatchFinder[] {
  const live = sources.filter((s) => s.share > 0);
  const total = live.reduce((sum, s) => sum + s.share, 0);
  if (total <= 0) return [];
  const taken = live.map(() => 0);
  const out: MatchFinder[] = [];
  while (out.length < limit) {
    let next = -1;
    let bestDeficit = Number.NEGATIVE_INFINITY;
    const position = out.length + 1;
    live.forEach((s, i) => {
      if (taken[i] >= s.available) return;
      const deficit = position * (s.share / total) - taken[i];
      if (deficit > bestDeficit + 1e-9) {
        bestDeficit = deficit;
        next = i;
      }
    });
    if (next < 0) break;
    out.push(live[next].finder);
    taken[next] += 1;
  }
  return out;
}

// ── Chapter 3 · Tradition (traditional compatibility from birth details) ──────

/** What both people have added. Time always comes with a time zone; place adds coordinates. */
export type BirthDetailLevel = 'none' | 'date' | 'time' | 'place';
/**
 * How often the engine can compare a system at a level. Measured by running the production
 * CosmicChartCalculator + TraditionalComparisonEngine on 400 random pairs per level: always ≥ 99%,
 * usually 60 to 98%, sometimes 15 to 59%, never 0%. (A placement is only kept when it is the same
 * across the whole uncertainty window of the birth moment, so a date alone cannot pin the Moon.)
 */
export type Availability = 'always' | 'usually' | 'sometimes' | 'never';

export interface TraditionalSystemInfo {
  id: string;
  name: string;
  tradition: string;
  needs: Record<Exclude<BirthDetailLevel, 'none'>, Availability>;
}

/** All 13 systems, in the order of OneHook's master comparison table. */
export const TRADITIONAL_SYSTEMS: readonly TraditionalSystemInfo[] = [
  { id: 'vedic', name: 'Kundali', tradition: 'Hindu', needs: { date: 'never', time: 'always', place: 'always' } },
  { id: 'western', name: 'Natal chart', tradition: 'Western', needs: { date: 'always', time: 'always', place: 'always' } },
  { id: 'bazi', name: 'Bazi', tradition: 'Chinese', needs: { date: 'always', time: 'always', place: 'always' } },
  { id: 'ziwei', name: 'Zi Wei Dou Shu', tradition: 'Chinese', needs: { date: 'never', time: 'always', place: 'always' } },
  { id: 'tzolkin', name: 'Tzolk’in', tradition: 'Mayan', needs: { date: 'always', time: 'always', place: 'always' } },
  { id: 'tibetan', name: 'Elements', tradition: 'Tibetan', needs: { date: 'always', time: 'always', place: 'always' } },
  { id: 'hebrew', name: 'Mazal', tradition: 'Hebrew', needs: { date: 'usually', time: 'always', place: 'always' } },
  { id: 'arabic', name: 'Arabic Parts', tradition: 'Islamic', needs: { date: 'never', time: 'never', place: 'always' } },
  { id: 'buddhist', name: 'Zodiac cycle', tradition: 'Buddhist', needs: { date: 'always', time: 'always', place: 'always' } },
  { id: 'celtic', name: 'Tree astrology', tradition: 'Celtic', needs: { date: 'always', time: 'always', place: 'always' } },
  { id: 'egyptian', name: 'Deity zodiac', tradition: 'Egyptian', needs: { date: 'always', time: 'always', place: 'always' } },
  { id: 'hellenistic', name: 'Hellenistic chart', tradition: 'Greek', needs: { date: 'sometimes', time: 'always', place: 'always' } },
  { id: 'babylonian', name: 'Decans', tradition: 'Babylonian', needs: { date: 'usually', time: 'always', place: 'always' } },
];
