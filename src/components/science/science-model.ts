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

export type EngineId = 'engagement' | 'rhythm' | 'meaning';
export type SignalKind = 'view' | 'swipe' | 'session' | 'chat' | 'profile' | 'erase';

/** Which engines' subscriptions accept each event type (mirrors the Pub/Sub filters). */
export const ROUTES: Record<SignalKind, readonly EngineId[]> = {
  view: ['engagement'],
  swipe: ['engagement', 'rhythm'],
  session: ['engagement', 'rhythm'],
  chat: ['engagement'],
  profile: ['meaning'],
  erase: ['engagement', 'rhythm', 'meaning'],
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
