import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Clock } from 'lucide-react';
import { AlienScanner } from '../mascot';
import { BRAND, ENGINE_META, Meter, Panel, Range, Toggle, labelClass } from './ScienceUi';
import { CURVE_MAX_MIN, CURVE_MIN_MIN, ReplyCurve } from './ScienceDiagrams';
import {
  INTENT_THRESHOLD,
  classifyIntent,
  composeProfileText,
  cosine,
  deckPacing,
  embed,
  profileViewScore,
  replyScore,
  swipeScore,
  type DeckPacing,
  type SwipeDecision,
} from './science-model';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

const E = ENGINE_META.engagement;
const R = ENGINE_META.rhythm;
const M = ENGINE_META.meaning;

const lingerImage = '/media/man-with-backpack-walking-on-snow-covered-forest-b-JAJ77DS-1600.jpg';

/** Big centred numeric readout shared by every lab. */
function Readout({ value, label, dark = false, size = 'text-6xl' }: { value: string; label: string; dark?: boolean; size?: string }) {
  return (
    <p className={`font-mono font-light tabular-nums tracking-tight ${size} ${dark ? 'text-white' : 'text-[#0A0B10]'}`} aria-live="polite" aria-label={label}>
      {value}
    </p>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Chapter 1 — a single profile view, scored live. Two equal halves: the profile, the reading.
 * ────────────────────────────────────────────────────────────────────────────── */

export function ProfileViewLab() {
  const reduce = useReducedMotion();
  const [dwell, setDwell] = useState(18);
  const [photos, setPhotos] = useState(3);
  const [bio, setBio] = useState(true);
  const [prompts, setPrompts] = useState(1);
  const TOTAL = 6;
  const s = profileViewScore({ dwellSeconds: dwell, photosViewed: photos, totalPhotos: TOTAL, bioExpanded: bio, promptsRead: prompts });

  const parts = [
    { key: 'time', label: 'Time spent', value: s.time, max: 0.35, color: E.deep },
    { key: 'photos', label: 'Photos explored', value: s.photos, max: 0.25, color: E.color },
    { key: 'bio', label: 'Bio opened', value: s.bio, max: 0.2, color: M.deep },
    { key: 'prompts', label: 'Prompts read', value: s.prompts, max: 0.2, color: M.color },
  ];

  const verdict =
    s.total >= 0.75 ? 'Genuine curiosity' : s.total >= 0.45 ? 'A real look' : s.total >= 0.2 ? 'A passing glance' : 'Barely a blink';

  return (
    <div className="grid items-stretch gap-8 lg:grid-cols-2">
      <div className="relative min-h-[440px] overflow-hidden rounded-[28px] bg-black">
        <img src={lingerImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-80 grayscale-[35%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/10" />
        <div className="absolute left-6 right-6 top-6 flex gap-1.5" aria-hidden="true">
          {Array.from({ length: TOTAL }, (_, i) => (
            <span key={i} className="h-[2px] flex-1 rounded-full" style={{ background: i < photos ? '#FFFFFF' : 'rgba(255,255,255,0.28)' }} />
          ))}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-8 text-center text-white">
          <p className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/60">
            <Clock className="h-3 w-3" aria-hidden="true" /> {dwell}s on this profile
          </p>
          <p className="mt-3 text-3xl font-light">
            Arjun<span className="text-white/50">, 29</span>
          </p>
          <AnimatePresence initial={false}>
            {bio && (
              <motion.p
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-auto mt-3 max-w-sm text-sm font-light text-white/75"
              >
                Weekend trail runner, weekday product designer. Looking for someone who would rather hike than scroll.
              </motion.p>
            )}
          </AnimatePresence>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {['My ideal Sunday…', 'I geek out on…', 'Green flag:'].map((p, i) => (
              <span
                key={p}
                className="rounded-full border px-3 py-1 text-[11px] font-light transition-colors"
                style={{ borderColor: i < prompts ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.22)', color: i < prompts ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Panel className="flex flex-col">
        <p className={`${labelClass} text-center text-black/40`}>Be the viewer</p>
        <div className="mt-5 space-y-5">
          <Range label="Time on profile" value={dwell} min={0} max={90} onChange={setDwell} format={(v) => `${v}s`} accent={E.deep} />
          <Range label="Photos explored" value={photos} min={0} max={TOTAL} onChange={setPhotos} format={(v) => `${v} of ${TOTAL}`} accent={E.deep} />
          <Toggle label="Opened the bio" checked={bio} onChange={setBio} accent={M.deep} />
          <Range label="Prompts read" value={prompts} min={0} max={3} onChange={setPrompts} format={(v) => `${v} of 3`} accent={M.deep} />
        </div>

        <div className="mt-auto pt-6 text-center">
          <div className="border-t pt-5" style={{ borderColor: BRAND.hairlineLight }}>
            <p className={`${labelClass} text-black/40`}>What this moment says</p>
            <Readout value={s.total.toFixed(2)} label={`Engagement score ${s.total.toFixed(2)}`} />
            <p className="font-serif text-xl italic" style={{ color: BRAND.navy }}>
              {verdict}
            </p>
          </div>
          <div className="mx-auto mt-6 flex h-1.5 w-full overflow-hidden rounded-full bg-black/[0.05]" aria-hidden="true">
            {parts.map((p) => (
              <motion.span key={p.key} initial={false} animate={{ width: `${p.value * 100}%` }} style={{ background: p.color }} className="h-full" />
            ))}
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-left text-xs text-black/55">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                  {p.label}
                </span>
                <span className="font-mono tabular-nums text-black/45">
                  {p.value.toFixed(2)}/{p.max.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
      <p className="text-center text-xs font-light leading-relaxed text-black/45 lg:col-span-2">
        Time counts on a curve: the first seconds matter most, and nothing past a minute adds more. Staring does not beat reading.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Chapter 3 — the three minds.
 * ────────────────────────────────────────────────────────────────────────────── */

const DECISIONS: { id: SwipeDecision; label: string }[] = [
  { id: 'PASS', label: 'Pass' },
  { id: 'LIKE', label: 'Like' },
  { id: 'SUPER_LIKE', label: 'Super like' },
];

export function EngagementLab() {
  const [decision, setDecision] = useState<SwipeDecision>('LIKE');
  const [seconds, setSeconds] = useState(1.2);
  const score = swipeScore(decision, seconds * 1000);
  const line =
    decision === 'PASS'
      ? 'A pass is honest. It counts as no interest, never as a judgement of them.'
      : decision === 'SUPER_LIKE'
        ? 'A super like is the clearest thing you can say. It counts in full.'
        : seconds >= 5
          ? 'A like you thought about counts for almost twice as much as a reflex.'
          : seconds < 1
            ? 'A reflex like. It counts, but only a little over half.'
            : 'The longer you consider before liking, the more it means, up to five seconds.';

  return (
    <div className="grid items-center gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <div role="radiogroup" aria-label="Swipe decision" className="grid grid-cols-3 gap-2">
          {DECISIONS.map((d) => {
            const on = decision === d.id;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDecision(d.id)}
                {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_swipe' })}
                className="rounded-full border px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.25em] transition-colors"
                style={on ? { background: E.color, borderColor: E.color, color: BRAND.ink } : { borderColor: BRAND.hairlineDark, color: 'rgba(255,255,255,0.55)' }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <Range dark label="Time before deciding" value={seconds} min={0} max={8} step={0.1} onChange={setSeconds} format={(v) => `${v.toFixed(1)}s`} accent={E.color} />
      </div>
      <div className="text-center">
        <Readout dark size="text-7xl" value={score.toFixed(2)} label={`Swipe score ${score.toFixed(2)}`} />
        <div className="mx-auto mt-5 max-w-xs">
          <Meter dark value={score} color={E.color} label="Swipe engagement" />
        </div>
        <p className="mx-auto mt-6 max-w-sm text-sm font-light leading-relaxed text-white/60">{line}</p>
      </div>
    </div>
  );
}

const PACING_COPY: Record<DeckPacing, { title: string; body: string; color: string }> = {
  NORMAL: { title: 'Normal flow', body: 'Your deck moves at your pace. Nothing to adjust.', color: BRAND.silver },
  SLOW_DOWN: {
    title: 'Slow down',
    body: 'You are swiping faster than anyone can actually look. The suggestion: linger on fewer people.',
    color: R.color,
  },
  BREAK_SUGGESTED: {
    title: 'Take a break',
    body: 'Two hours of dating today. The most honest thing an app can say: step away, the right person will still be here.',
    color: E.color,
  },
};

export function RhythmLab() {
  const reduce = useReducedMotion();
  const [perMinute, setPerMinute] = useState(8);
  const [inWindow, setInWindow] = useState(14);
  const [minutes, setMinutes] = useState(25);
  const result = deckPacing({ swipesPerMinute: perMinute, swipesInWindow: inWindow, minutesToday: minutes });
  const copy = PACING_COPY[result.pacing];
  const spread = result.pacing === 'NORMAL' ? 26 : result.pacing === 'SLOW_DOWN' ? 12 : 3;

  return (
    <div className="grid items-center gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <Range dark label="Swipes per minute" value={perMinute} min={0} max={60} onChange={setPerMinute} accent={R.color} />
        <Range dark label="Swipes in the last 5 minutes" value={inWindow} min={0} max={50} onChange={setInWindow} accent={R.color} />
        <Range
          dark
          label="Time in the app today"
          value={minutes}
          min={0}
          max={180}
          step={5}
          onChange={setMinutes}
          format={(v) => `${Math.floor(v / 60)}h ${String(v % 60).padStart(2, '0')}m`}
          accent={R.color}
        />
      </div>

      <div className="flex flex-col items-center gap-5">
        <div className="relative h-48 w-full max-w-xs" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2 h-44 w-32 rounded-2xl border bg-gradient-to-b from-white/[0.09] to-white/[0.01]"
              style={{ borderColor: BRAND.hairlineDark }}
              initial={false}
              animate={{ x: `calc(-50% + ${(i - 2) * spread}px)`, y: '-50%', rotate: (i - 2) * (spread / 4), opacity: 1 - Math.abs(i - 2) * 0.2 }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 18 }}
            />
          ))}
        </div>
        <div className="text-center" aria-live="polite">
          <span
            className="inline-flex items-center rounded-full border px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em]"
            style={{ borderColor: copy.color, color: copy.color }}
          >
            {copy.title}
          </span>
          <p className="mx-auto mt-4 max-w-sm text-sm font-light leading-relaxed text-white/65">{copy.body}</p>
        </div>
      </div>
      <p className="text-center text-xs font-light leading-relaxed text-white/40 lg:col-span-2">
        Mass swiping needs both speed (20+ a minute) and volume (10+ recent swipes), so one quick flick never trips it. Two hours in one day,
        including the session you are in, suggests a break.
      </p>
    </div>
  );
}

function VectorBarcode({ vector, color }: { vector: number[]; color: string }) {
  const max = Math.max(...vector.map((v) => Math.abs(v)), 0.0001);
  return (
    <div className="flex h-10 items-center gap-[2px]" aria-hidden="true">
      {vector.map((v, i) => (
        <span
          key={i}
          className="w-full rounded-full transition-all duration-300"
          style={{ height: `${8 + (Math.abs(v) / max) * 92}%`, background: v >= 0 ? color : 'rgba(255,255,255,0.22)', opacity: v === 0 ? 0.12 : 1 }}
        />
      ))}
    </div>
  );
}

function ProfileTextInput({
  label,
  bio,
  interests,
  onBio,
  onInterests,
  vector,
  color,
}: {
  label: string;
  bio: string;
  interests: string;
  onBio: (v: string) => void;
  onInterests: (v: string) => void;
  vector: number[];
  color: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className={`${labelClass} mb-3 w-full text-center text-white/45`}>{label}</legend>
      <label className="block">
        <span className="sr-only">{label} bio</span>
        <textarea
          value={bio}
          maxLength={400}
          onChange={(e) => onBio(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-2xl border bg-white/[0.03] p-4 text-sm font-light text-white outline-none focus:border-white/40"
          style={{ borderColor: BRAND.hairlineDark }}
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Interests</span>
        <input
          value={interests}
          maxLength={200}
          onChange={(e) => onInterests(e.target.value)}
          className="mt-1.5 w-full rounded-xl border bg-white/[0.03] px-4 py-2.5 text-sm font-light text-white outline-none focus:border-white/40"
          style={{ borderColor: BRAND.hairlineDark }}
        />
      </label>
      <VectorBarcode vector={vector} color={color} />
    </fieldset>
  );
}

export function MeaningLab() {
  const [bioA, setBioA] = useState('Sunrise hikes, filter coffee and long conversations about books.');
  const [intA, setIntA] = useState('hiking, coffee, books, travel');
  const [bioB, setBioB] = useState('Happiest on a mountain trail with a good book and strong coffee.');
  const [intB, setIntB] = useState('trekking, books, coffee, photography');

  const { va, vb, sim } = useMemo(() => {
    const ta = composeProfileText(bioA, intA.split(','), []);
    const tb = composeProfileText(bioB, intB.split(','), []);
    const a = embed(ta);
    const b = embed(tb);
    return { va: a, vb: b, sim: ta && tb ? cosine(a, b) : 0 };
  }, [bioA, intA, bioB, intB]);

  const label = sim > 0.45 ? 'Speaking the same language' : sim > 0.2 ? 'Some common ground' : sim > 0.05 ? 'Different worlds' : 'Strangers, for now';

  return (
    <div>
      {/* Symmetric: profile A · closeness · profile B */}
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(220px,0.8fr)_1fr]">
        <ProfileTextInput label="Profile A" bio={bioA} interests={intA} onBio={setBioA} onInterests={setIntA} vector={va} color={M.color} />
        <div className="order-first text-center lg:order-none">
          <p className={`${labelClass} text-white/45`}>Closeness in meaning</p>
          <Readout dark size="text-7xl" value={sim.toFixed(2)} label={`Similarity ${sim.toFixed(2)}`} />
          <p className="font-serif text-xl italic" style={{ color: M.color }}>
            {label}
          </p>
          <div className="mx-auto mt-6 max-w-[200px]">
            <Meter dark value={(sim + 1) / 2} color={M.color} label="Semantic similarity" />
          </div>
        </div>
        <ProfileTextInput label="Profile B" bio={bioB} interests={intB} onBio={setBioB} onInterests={setIntB} vector={vb} color={M.color} />
      </div>
      <div className="mx-auto mt-8 max-w-2xl space-y-3 text-center">
        <p className="text-sm font-light leading-relaxed text-white/60">
          Each profile becomes a point in a space of meaning. “Trail” and “hike” are different words, but in the real model they land close
          together, so two people can match on <em>what</em> they say, not just the exact words.
        </p>
        <p className="text-xs font-light leading-relaxed text-white/40">
          Illustration: OneHook runs a sentence-transformer language model on its own servers, with no third-party AI service. This demo uses a
          small word-hashing stand-in that runs only in your browser, so it matches words rather than synonyms. Nothing you type here leaves
          this page.
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Chapter 4 — time: reply rhythm and intent.
 * ────────────────────────────────────────────────────────────────────────────── */

const minutesFromSlider = (t: number) =>
  Math.round(Math.exp(Math.log(CURVE_MIN_MIN) + (t / 1000) * (Math.log(CURVE_MAX_MIN) - Math.log(CURVE_MIN_MIN))));

function humanDuration(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest && h < 10 ? `${h}h ${rest}m` : `${h}h`;
}

const curveFn = (m: number) => replyScore(m * 60 * 1000);

export function ReplyLab() {
  const [t, setT] = useState(260);
  const minutes = minutesFromSlider(t);
  const score = curveFn(minutes);
  return (
    <Panel className="flex h-full flex-col">
      <p className={`${labelClass} text-center text-black/40`}>Reply rhythm</p>
      <div className="mt-4 text-center">
        <Readout value={score.toFixed(2)} label={`Reply score ${score.toFixed(2)}`} />
        <p className="font-serif text-xl italic" style={{ color: BRAND.navy }}>
          replied after {humanDuration(minutes)}
        </p>
      </div>
      <div className="mt-6">
        <ReplyCurve minutes={minutes} score={score} curve={curveFn} />
      </div>
      <Range label="Reply time" value={t} min={0} max={1000} onChange={setT} format={() => humanDuration(minutes)} accent={BRAND.navy} />
      <p className="mt-auto pt-6 text-center text-xs font-light leading-relaxed text-black/45">
        Within five minutes counts in full; it fades gently to a floor at a day, because life happens. A first message, with nothing to reply
        to, counts as initiative (0.70).
      </p>
    </Panel>
  );
}

const MOMENTS: { id: string; label: string; score: number }[] = [
  {
    id: 'linger',
    label: 'Lingered 40 s, read every prompt',
    score: profileViewScore({ dwellSeconds: 40, photosViewed: 5, totalPhotos: 6, bioExpanded: true, promptsRead: 3 }).total,
  },
  { id: 'glance', label: 'Glanced for a second', score: profileViewScore({ dwellSeconds: 1, photosViewed: 1, totalPhotos: 6, bioExpanded: false, promptsRead: 0 }).total },
  { id: 'considered', label: 'Liked after 4 s of thought', score: swipeScore('LIKE', 4000) },
  { id: 'reflex', label: 'Reflex like in 0.3 s', score: swipeScore('LIKE', 300) },
  { id: 'super', label: 'Sent a super like', score: swipeScore('SUPER_LIKE', 0) },
  { id: 'pass', label: 'Passed', score: swipeScore('PASS', 0) },
  { id: 'fast', label: 'Replied within 3 minutes', score: replyScore(3 * 60 * 1000) },
  { id: 'late', label: 'Replied the next day', score: replyScore(26 * 3600 * 1000) },
  { id: 'opener', label: 'Sent the first message', score: replyScore(null) },
  { id: 'assist', label: 'Asked Mr OneHook for help', score: 0.6 },
];

export function IntentLab() {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(['linger', 'considered', 'reflex', 'fast']));
  const scores = MOMENTS.filter((m) => picked.has(m.id)).map((m) => m.score);
  const result = classifyIntent(scores);
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Panel className="flex h-full flex-col">
      <p className={`${labelClass} text-center text-black/40`}>Intent from your last few moments</p>
      <div className="mt-4 text-center" aria-live="polite">
        <p className="text-3xl font-light">
          {result.intent === 'SERIOUS' ? (
            <>
              Here for something <span className="font-serif italic" style={{ color: BRAND.navy }}>real</span>
            </>
          ) : (
            <>
              Browsing <span className="font-serif italic text-black/50">casually</span>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-black/45">
          {result.average === null ? 'No moments yet: we assume nothing.' : `${Math.round(result.confidence * 100)}% confident`}
        </p>
      </div>
      <div className="mx-auto mt-6 w-full max-w-sm">
        <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.25em] text-black/35">
          <span>Casual</span>
          <span>Serious</span>
        </div>
        <div className="mt-2">
          <Meter value={result.average ?? 0} color={result.intent === 'SERIOUS' ? BRAND.navy : BRAND.silver} threshold={INTENT_THRESHOLD} label="Average engagement" />
        </div>
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {MOMENTS.map((m) => {
          const on = picked.has(m.id);
          return (
            <li key={m.id}>
              <label
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-full border px-4 py-2 text-[13px] font-light transition-colors ${
                  on ? 'border-transparent text-white' : 'text-black/60 hover:border-black/25'
                }`}
                style={on ? { background: BRAND.navy } : { borderColor: BRAND.hairlineLight }}
              >
                <span className="flex items-center gap-2.5">
                  <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="sr-only" />
                  <span aria-hidden="true" className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${on ? 'border-white bg-white text-[#1F3A6B]' : 'border-black/25'}`}>
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  {m.label}
                </span>
                <span className="font-mono text-[11px] tabular-nums opacity-60">{m.score.toFixed(2)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto pt-6 text-center text-xs font-light leading-relaxed text-black/45">
        Intent comes only from how <em>you</em> engage: never your photos, never anyone else’s opinion of you. It is rebuilt from your latest
        moments and forgotten within a day.
      </p>
    </Panel>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Chapter 5 — Mr OneHook. Symmetric: what you can talk about · Mr OneHook · his reply.
 * A visitor picks a topic; the chat card plays that short exchange.
 * ────────────────────────────────────────────────────────────────────────────── */

const MR_TOPICS = [
  {
    id: 'want',
    label: 'What I’m looking for',
    ask: 'I want someone calm, who reads and actually plans weekends.',
    reply: 'Calm, a reader, a planner. Then look past “chill vibes” and for prompts about books and real plans.',
  },
  {
    id: 'liked',
    label: 'Who I liked',
    ask: 'I really liked the guy who loves filter coffee and old Delhi walks.',
    reply: 'Nice pick. Slow mornings and curiosity seem to matter to you. Look for that in the next profiles too.',
  },
  {
    id: 'suggest',
    label: 'Ask for a suggestion',
    ask: 'Between the two I liked, who should I reply to first?',
    reply: 'The one who asked you a question back. Replies that ask tend to keep going.',
  },
  {
    id: 'date',
    label: 'Plan a first date',
    ask: 'He likes coffee. Where should we meet?',
    reply: 'A quiet café in Khan Market on a weekend morning. Easy to talk, easy to leave.',
  },
] as const;

export function MrOneHookLab() {
  const reduce = useReducedMotion();
  const [topicId, setTopicId] = useState<(typeof MR_TOPICS)[number]['id']>('want');
  const topic = MR_TOPICS.find((t) => t.id === topicId) ?? MR_TOPICS[0];

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
      <Panel className="h-full">
        <p className={`${labelClass} text-center text-black/40`}>Talk to him about</p>
        <ul className="mt-5 space-y-2.5">
          {MR_TOPICS.map((t) => {
            const on = t.id === topicId;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTopicId(t.id)}
                  {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_tab' })}
                  aria-pressed={on}
                  className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition-colors ${on ? 'font-semibold text-white' : 'bg-black/[0.04] font-light hover:bg-black/[0.07]'}`}
                  style={on ? { background: BRAND.navy } : undefined}
                >
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="flex flex-col items-center gap-3 px-4">
        <div className="w-28 lg:w-36" aria-hidden="true">
          <AlienScanner />
        </div>
        <p className={`${labelClass} text-black/40`}>Mr OneHook</p>
      </div>

      <div className="flex h-full flex-col rounded-[28px] p-6 sm:p-9" style={{ background: BRAND.ink }} aria-live="polite">
        <p className={`${labelClass} mb-5 text-center text-white/45`}>Your chat with him</p>
        <AnimatePresence mode="wait">
          <motion.div
            key={topic.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-3"
          >
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm font-light text-black">{topic.ask}</p>
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.55, duration: 0.3 }}
              className="mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5 text-sm font-light text-white/90"
            >
              {topic.reply}
            </motion.p>
          </motion.div>
        </AnimatePresence>
        <p className="mt-auto pt-6 text-center text-[11px] font-light text-white/40">You choose what to share. Your match chats stay encrypted.</p>
      </div>
    </div>
  );
}

/* Legend reused by the hero: three minds, evenly spaced. */
export function EngineLegend({ dark = true }: { dark?: boolean }) {
  return (
    <ul className="mx-auto grid max-w-3xl grid-cols-3 gap-4">
      {(Object.keys(ENGINE_META) as (keyof typeof ENGINE_META)[]).map((k) => (
        <li key={k} className="flex flex-col items-center gap-2 text-center">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ENGINE_META[k].color }} aria-hidden="true" />
          <span className={`text-[10px] font-semibold uppercase tracking-[0.3em] ${dark ? 'text-white/70' : 'text-black/60'}`}>{ENGINE_META[k].name}</span>
          <span className={`hidden text-xs font-light sm:block ${dark ? 'text-white/40' : 'text-black/40'}`}>{ENGINE_META[k].role}</span>
        </li>
      ))}
    </ul>
  );
}
