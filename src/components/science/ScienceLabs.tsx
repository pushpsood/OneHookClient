import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Clock } from 'lucide-react';
import { AlienScanner } from '../mascot';
import { BRAND, Disclosure, ENGINE_META, Meter, Panel, Range, TryIt, labelClass } from './ScienceUi';
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
function Readout({ value, label, dark = false, size = 'text-5xl' }: { value: string; label: string; dark?: boolean; size?: string }) {
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
  const [dwell, setDwell] = useState(18);
  const [photos, setPhotos] = useState(3);
  const [prompts, setPrompts] = useState(1);
  const TOTAL = 6;
  // The bio is always on the profile, so there is no separate "opened the bio" action to score.
  const s = profileViewScore({ dwellSeconds: dwell, photosViewed: photos, totalPhotos: TOTAL, bioExpanded: false, promptsRead: prompts });

  const parts = [
    { key: 'time', label: 'Time spent', value: s.time, color: E.deep },
    { key: 'photos', label: 'Photos explored', value: s.photos, color: E.color },
    { key: 'prompts', label: 'Prompts read', value: s.prompts, color: M.deep },
  ];

  const verdict =
    s.total >= 0.65 ? 'Genuine curiosity' : s.total >= 0.4 ? 'A real look' : s.total >= 0.2 ? 'A passing glance' : 'Barely a blink';

  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-2">
      <div className="relative min-h-[320px] overflow-hidden rounded-[24px] bg-black">
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
          <p className="mx-auto mt-3 max-w-sm text-sm font-light text-white/75">
            Weekend trail runner, weekday product designer. Looking for someone who would rather hike than scroll.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {/* Prompts light up as the "Prompts read" slider counts them. */}
            {['My ideal Sunday…', 'I geek out on…', 'Green flag:'].map((p, i) => (
              <span
                key={p}
                className="rounded-full border px-3 py-1 text-[11px] font-light transition-colors duration-300"
                style={{ borderColor: i < prompts ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.22)', color: i < prompts ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Panel className="flex flex-col">
        <TryIt>Move the sliders as you view Arjun.</TryIt>
        <div className="mt-5 space-y-4">
          <Range inline label="Time on profile" value={dwell} min={0} max={90} onChange={setDwell} format={(v) => `${v}s`} accent={E.deep} />
          <Range inline label="Photos explored" value={photos} min={0} max={TOTAL} onChange={setPhotos} format={(v) => `${v} of ${TOTAL}`} accent={E.deep} />
          <Range inline label="Prompts read" value={prompts} min={0} max={3} onChange={setPrompts} format={(v) => `${v} of 3`} accent={M.deep} />
        </div>

        <div className="mt-auto pt-4 text-center">
          <div className="border-t pt-4" style={{ borderColor: BRAND.hairlineLight }}>
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
          <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-black/55">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                  {p.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Chapter 3 — the three minds.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Equal-width subsection tabs, shared by Engagement, Rhythm and Meaning. */
function SubsectionTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  accent,
  trackValue = 'science_tab',
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T | null;
  onChange: (id: T) => void;
  accent: string;
  trackValue?: 'science_tab' | 'science_swipe';
}) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-[#FAFAF8] px-3 pt-3 sm:px-4 sm:pt-4">
      <p className={`${labelClass} text-center text-black/35`}>{label}</p>
      <div role="group" aria-label={label} className="mt-3 grid grid-cols-3 border-b border-black/[0.07]">
        {options.map((option) => {
          const on = value === option.id;
          const words = option.label.split(' ');
          const splitAt = Math.ceil(words.length / 2);
          const mobileLines = words.length > 1 ? [words.slice(0, splitAt).join(' '), words.slice(splitAt).join(' ')] : words;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(option.id)}
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: trackValue })}
              className="relative flex min-h-12 items-center justify-center px-0.5 pb-3 pt-1 text-[9px] font-semibold uppercase leading-[1.2] tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/20 sm:min-h-0 sm:whitespace-nowrap sm:text-[10px] sm:tracking-[0.14em]"
              style={{ color: on ? accent : 'rgba(10,11,16,0.38)' }}
            >
              <span className="sm:hidden">
                {mobileLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
              <span className="hidden sm:inline">{option.label}</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full transition-all duration-300 sm:inset-x-4"
                style={{ background: on ? accent : 'transparent', transform: `scaleX(${on ? 1 : 0})` }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
      ? 'A pass is honest. Never a judgement of them.'
      : decision === 'SUPER_LIKE'
        ? 'The clearest thing you can say.'
        : seconds >= 5
          ? 'A like you thought about says far more than a reflex.'
          : seconds < 1
            ? 'A reflex like still counts. Just less.'
            : 'The longer you consider, the more it means.';

  return (
    // One centred column, like Rhythm and Meaning: choose first, then read the result below.
    <div className="mx-auto max-w-2xl space-y-5">
      <SubsectionTabs
        label="Decision"
        options={DECISIONS}
        value={decision}
        onChange={setDecision}
        accent={E.deep}
        trackValue="science_swipe"
      />
      <Range inline label="Thinking time" value={seconds} min={0} max={8} step={0.1} onChange={setSeconds} format={(v) => `${v.toFixed(1)}s`} accent={E.deep} />
      <div className="text-center">
        <Readout size="text-6xl" value={score.toFixed(2)} label={`Swipe score ${score.toFixed(2)}`} />
        <div className="mx-auto mt-3 max-w-xs">
          <Meter value={score} color={E.deep} label="Swipe engagement" />
        </div>
        <p className="mx-auto mt-3 max-w-sm text-sm font-light leading-relaxed text-black/60">{line}</p>
      </div>
    </div>
  );
}

const PACING_COPY: Record<DeckPacing, { title: string; body: string; color: string }> = {
  NORMAL: { title: 'Normal flow', body: 'Your pace. Nothing to change.', color: '#5E6670' },
  SLOW_DOWN: {
    title: 'Slow down',
    body: 'Faster than anyone can really look. Fewer, slower is better.',
    color: R.deep,
  },
  BREAK_SUGGESTED: {
    title: 'Take a break',
    body: 'A long day in the app. The right person will still be here.',
    color: E.deep,
  },
};

const RHYTHM_PRESETS = [
  { id: 'relaxed', label: 'Relaxed browsing', values: { perMinute: 8, inWindow: 14, minutes: 25 } },
  { id: 'speed', label: 'Speed swiping', values: { perMinute: 32, inWindow: 30, minutes: 25 } },
  { id: 'marathon', label: 'Two hours in', values: { perMinute: 6, inWindow: 10, minutes: 130 } },
] as const;
type RhythmPresetId = (typeof RHYTHM_PRESETS)[number]['id'];

export function RhythmLab() {
  const reduce = useReducedMotion();
  const [preset, setPreset] = useState<RhythmPresetId | null>('relaxed');
  const [perMinute, setPerMinute] = useState<number>(RHYTHM_PRESETS[0].values.perMinute);
  const [inWindow, setInWindow] = useState<number>(RHYTHM_PRESETS[0].values.inWindow);
  const [minutes, setMinutes] = useState<number>(RHYTHM_PRESETS[0].values.minutes);
  const [tuning, setTuning] = useState(false);
  const result = deckPacing({ swipesPerMinute: perMinute, swipesInWindow: inWindow, minutesToday: minutes });
  const copy = PACING_COPY[result.pacing];
  const spread = result.pacing === 'NORMAL' ? 26 : result.pacing === 'SLOW_DOWN' ? 12 : 3;

  const applyPreset = (id: RhythmPresetId) => {
    const p = RHYTHM_PRESETS.find((x) => x.id === id) ?? RHYTHM_PRESETS[0];
    setPreset(id);
    setPerMinute(p.values.perMinute);
    setInWindow(p.values.inWindow);
    setMinutes(p.values.minutes);
  };
  // Moving a slider by hand leaves the named scenarios.
  const tune = (set: (v: number) => void) => (v: number) => {
    setPreset(null);
    set(v);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SubsectionTabs label="Usage pattern" options={RHYTHM_PRESETS} value={preset} onChange={applyPreset} accent={R.deep} />

      <div className="flex flex-col items-center gap-4">
        <div className="relative h-28 w-full max-w-xs" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2 h-24 w-20 rounded-xl border bg-gradient-to-b from-white to-[#F4F4F1] shadow-[0_18px_40px_-30px_rgba(10,11,16,0.35)]"
              style={{ borderColor: BRAND.hairlineLight }}
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
          <p className="mx-auto mt-2 max-w-sm text-sm font-light leading-relaxed text-black/65">{copy.body}</p>
        </div>
      </div>

      <Disclosure label="Adjust the numbers" open={tuning} onToggle={() => setTuning((o) => !o)}>
        <div className="space-y-6">
          <Range inline label="Swipes / min" value={perMinute} min={0} max={60} onChange={tune(setPerMinute)} accent={R.deep} />
          <Range inline label="Last 5 min" value={inWindow} min={0} max={50} onChange={tune(setInWindow)} accent={R.deep} />
          <Range
            inline
            label="Time today"
            value={minutes}
            min={0}
            max={180}
            step={5}
            onChange={tune(setMinutes)}
            format={(v) => `${Math.floor(v / 60)}h ${String(v % 60).padStart(2, '0')}m`}
            accent={R.deep}
          />
        </div>
      </Disclosure>
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
          style={{ height: `${8 + (Math.abs(v) / max) * 92}%`, background: v >= 0 ? color : 'rgba(10,11,16,0.16)', opacity: v === 0 ? 0.12 : 1 }}
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
      <legend className={`${labelClass} mb-3 w-full text-center text-black/45`}>{label}</legend>
      <label className="block">
        <span className="sr-only">{label} bio</span>
        <textarea
          value={bio}
          maxLength={400}
          onChange={(e) => onBio(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-2xl border bg-white p-4 text-sm font-light text-[#0A0B10] outline-none focus:border-black/30"
          style={{ borderColor: BRAND.hairlineLight }}
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-black/35">Interests</span>
        <input
          value={interests}
          maxLength={200}
          onChange={(e) => onInterests(e.target.value)}
          className="mt-1.5 w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-light text-[#0A0B10] outline-none focus:border-black/30"
          style={{ borderColor: BRAND.hairlineLight }}
        />
      </label>
      <VectorBarcode vector={vector} color={color} />
    </fieldset>
  );
}

const MEANING_A = { bio: 'Sunrise hikes, filter coffee and long conversations about books.', interests: 'hiking, coffee, books, travel' };
const MEANING_PRESETS = [
  {
    id: 'close',
    label: 'Kindred spirits',
    b: { bio: 'Sunrise hikes and books, then strong filter coffee and long conversations.', interests: 'hiking, books, coffee, travel' },
  },
  {
    id: 'some',
    label: 'Some overlap',
    b: { bio: 'Weekend photographer who loves coffee and slow city walks.', interests: 'photography, coffee, cities' },
  },
  {
    id: 'apart',
    label: 'Different worlds',
    b: { bio: 'Competitive chess player and late-night jazz pianist.', interests: 'chess, jazz, piano' },
  },
] as const;
type MeaningPresetId = (typeof MEANING_PRESETS)[number]['id'];

function ProfileCard({ label, bio, interests, vector }: { label: string; bio: string; interests: string; vector: number[] }) {
  return (
    <figure className="rounded-xl border bg-[#FAFAF8] p-4 text-left" style={{ borderColor: BRAND.hairlineLight }}>
      <figcaption className={`${labelClass} text-black/45`}>{label}</figcaption>
      <p className="mt-2 text-sm font-light leading-relaxed text-black/75">{bio || <span className="text-black/35">No bio yet</span>}</p>
      <p className="mt-2 text-xs font-light text-black/45">{interests}</p>
      <div className="mt-3">
        <VectorBarcode vector={vector} color={M.deep} />
      </div>
    </figure>
  );
}

export function MeaningLab() {
  const [preset, setPreset] = useState<MeaningPresetId | null>('close');
  const [bioA, setBioA] = useState<string>(MEANING_A.bio);
  const [intA, setIntA] = useState<string>(MEANING_A.interests);
  const [bioB, setBioB] = useState<string>(MEANING_PRESETS[0].b.bio);
  const [intB, setIntB] = useState<string>(MEANING_PRESETS[0].b.interests);
  const [editing, setEditing] = useState(false);

  const { va, vb, sim } = useMemo(() => {
    const ta = composeProfileText(bioA, intA.split(','), []);
    const tb = composeProfileText(bioB, intB.split(','), []);
    const a = embed(ta);
    const b = embed(tb);
    return { va: a, vb: b, sim: ta && tb ? cosine(a, b) : 0 };
  }, [bioA, intA, bioB, intB]);

  const label = sim > 0.45 ? 'Speaking the same language' : sim > 0.2 ? 'Some common ground' : sim > 0.05 ? 'Different worlds' : 'Strangers, for now';

  const applyPreset = (id: MeaningPresetId) => {
    const p = MEANING_PRESETS.find((x) => x.id === id) ?? MEANING_PRESETS[0];
    setPreset(id);
    setBioA(MEANING_A.bio);
    setIntA(MEANING_A.interests);
    setBioB(p.b.bio);
    setIntB(p.b.interests);
  };
  const edit = (set: (v: string) => void) => (v: string) => {
    setPreset(null);
    set(v);
  };

  return (
    <div className="space-y-5">
      <SubsectionTabs label="Profile pair" options={MEANING_PRESETS} value={preset} onChange={applyPreset} accent={M.deep} />

      <div className="grid items-center gap-4 lg:grid-cols-[1fr_minmax(180px,0.65fr)_1fr]">
        {editing ? (
          <ProfileTextInput label="Profile A" bio={bioA} interests={intA} onBio={edit(setBioA)} onInterests={edit(setIntA)} vector={va} color={M.deep} />
        ) : (
          <ProfileCard label="Profile A" bio={bioA} interests={intA} vector={va} />
        )}
        <div className="order-first text-center lg:order-none">
          <p className={`${labelClass} text-black/45`}>Closeness in meaning</p>
          <Readout size="text-6xl" value={sim.toFixed(2)} label={`Similarity ${sim.toFixed(2)}`} />
          <p className="font-serif text-xl italic" style={{ color: M.deep }}>
            {label}
          </p>
          <div className="mx-auto mt-4 max-w-[180px]">
            <Meter value={(sim + 1) / 2} color={M.deep} label="Semantic similarity" />
          </div>
        </div>
        {editing ? (
          <ProfileTextInput label="Profile B" bio={bioB} interests={intB} onBio={edit(setBioB)} onInterests={edit(setIntB)} vector={vb} color={M.deep} />
        ) : (
          <ProfileCard label="Profile B" bio={bioB} interests={intB} vector={vb} />
        )}
      </div>

      <p className="mx-auto max-w-xl text-center text-sm font-light leading-relaxed text-black/55">
        Little in common isn&rsquo;t a dead end. A separate engine also introduces people who are different, because opposites can make great matches too.
      </p>

      <Disclosure label="Write your own profiles" open={editing} onToggle={() => setEditing((o) => !o)}>
        <p className="text-center text-xs font-light text-black/45">Edit either profile above. Nothing you type leaves this page.</p>
      </Disclosure>

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

const tFromMinutes = (m: number) =>
  Math.round((1000 * (Math.log(m) - Math.log(CURVE_MIN_MIN))) / (Math.log(CURVE_MAX_MIN) - Math.log(CURVE_MIN_MIN)));

const REPLY_PRESETS = [
  { id: 'quick', label: 'In 3 min', minutes: 3 },
  { id: 'hour', label: 'After an hour', minutes: 60 },
  { id: 'nextday', label: 'Next day', minutes: 26 * 60 },
] as const;
type ReplyPresetId = (typeof REPLY_PRESETS)[number]['id'];

export function ReplyLab() {
  const [t, setT] = useState(() => tFromMinutes(60));
  const [preset, setPreset] = useState<ReplyPresetId | null>('hour');
  const minutes = minutesFromSlider(t);
  const score = curveFn(minutes);
  const applyPreset = (id: ReplyPresetId) => {
    const p = REPLY_PRESETS.find((x) => x.id === id) ?? REPLY_PRESETS[0];
    setPreset(id);
    setT(tFromMinutes(p.minutes));
  };
  return (
    <div className="flex h-full flex-col">
      <SubsectionTabs label="When did they reply?" options={REPLY_PRESETS} value={preset} onChange={applyPreset} accent={BRAND.navy} />
      <div className="mt-5 text-center">
        <Readout value={score.toFixed(2)} label={`Reply score ${score.toFixed(2)}`} />
        <p className="font-serif text-xl italic" style={{ color: BRAND.navy }}>
          replied after {humanDuration(minutes)}
        </p>
      </div>
      <div className="mt-6">
        <ReplyCurve minutes={minutes} score={score} curve={curveFn} />
      </div>
      <Range
        inline
        label="Reply time"
        value={t}
        min={0}
        max={1000}
        onChange={(v) => {
          setPreset(null);
          setT(v);
        }}
        format={() => humanDuration(minutes)}
        accent={BRAND.navy}
      />
      <p className="mt-auto pt-4 text-center text-xs font-light leading-relaxed text-black/45">Life happens. A late reply is never a zero.</p>
    </div>
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

const INTENT_PRESETS = [
  { id: 'thoughtful', label: 'Thoughtful', moments: ['linger', 'considered', 'fast', 'opener'] },
  { id: 'quick', label: 'Quick swiper', moments: ['glance', 'reflex', 'pass', 'late'] },
  { id: 'new', label: 'Just joined', moments: [] },
] as const;
type IntentPresetId = (typeof INTENT_PRESETS)[number]['id'];

export function IntentLab() {
  const [preset, setPreset] = useState<IntentPresetId | null>('thoughtful');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(INTENT_PRESETS[0].moments));
  const [customizing, setCustomizing] = useState(false);
  const chosen = MOMENTS.filter((m) => picked.has(m.id));
  const result = classifyIntent(chosen.map((m) => m.score));
  const applyPreset = (id: IntentPresetId) => {
    const p = INTENT_PRESETS.find((x) => x.id === id) ?? INTENT_PRESETS[0];
    setPreset(id);
    setPicked(new Set(p.moments));
  };
  const toggle = (id: string) => {
    setPreset(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <SubsectionTabs label="How have they behaved?" options={INTENT_PRESETS} value={preset} onChange={applyPreset} accent={BRAND.navy} />

      <div className="mt-5 text-center" aria-live="polite">
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
          {result.average === null ? 'No moments yet, so we assume nothing.' : `${Math.round(result.confidence * 100)}% confident`}
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

      {!customizing && (
        <div className="mt-5 text-center">
          <p className={`${labelClass} text-black/35`}>Based on</p>
          {chosen.length ? (
            <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
              {chosen.map((m) => (
                <li key={m.id} className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-light text-black/60">
                  {m.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs font-light text-black/45">Nothing yet</p>
          )}
        </div>
      )}

      <div className="mt-5">
        <Disclosure label="Choose moments yourself" open={customizing} onToggle={() => setCustomizing((o) => !o)}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {MOMENTS.map((m) => {
              const on = picked.has(m.id);
              return (
                <li key={m.id}>
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-full border px-4 py-2 text-[13px] font-light transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#1F3A6B]/40 ${
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
                  </label>
                </li>
              );
            })}
          </ul>
        </Disclosure>
      </div>

      <p className="mt-auto pt-4 text-center text-xs font-light leading-relaxed text-black/45">
        Read from how <em>you</em> engage. Never from your photos.
      </p>
    </div>
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
    reply: [
      'Calm, a reader, a planner. Then look past “chill vibes” and for prompts about books and real plans.',
      'I sense your preference. I’ll try to find you matches who lean more towards this.',
    ],
  },
  {
    id: 'liked',
    label: 'Who I liked',
    ask: 'I really liked the guy who loves filter coffee and old Delhi walks.',
    reply: ['Nice pick. Slow mornings and curiosity seem to matter to you. Look for that in the next profiles too.'],
  },
  {
    id: 'suggest',
    label: 'Ask for a suggestion',
    ask: 'I got likes from Sunil and Sharan, and I like them both. Whom should I talk to?',
    reply: [
      'You talk to one person at a time here. Pick the one whose profile made you want to ask a question. Sharan’s weekend treks are a great opener.',
    ],
  },
  {
    id: 'date',
    label: 'Plan a first date',
    ask: 'He likes coffee. Where should we meet?',
    reply: ['A quiet café in Khan Market on a weekend morning. Easy to talk, easy to leave.'],
  },
] as const;

export function MrOneHookLab() {
  const reduce = useReducedMotion();
  const [topicId, setTopicId] = useState<(typeof MR_TOPICS)[number]['id']>('want');
  const topic = MR_TOPICS.find((t) => t.id === topicId) ?? MR_TOPICS[0];

  return (
    <Panel>
      <TryIt>Pick a topic and see his reply.</TryIt>
      <div className="mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Talk to him about">
        {MR_TOPICS.map((t) => {
          const on = t.id === topicId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTopicId(t.id)}
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_tab' })}
              aria-pressed={on}
              className={`inline-flex items-center rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors ${
                on ? 'border-[#0A0B10] bg-[#0A0B10] text-white' : 'border-black/10 text-black/55 hover:border-black/30 hover:text-black'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* The inner box: the chat itself, with Mr OneHook and the privacy note inside it. */}
      <div className="mx-auto mt-5 flex max-w-2xl flex-col rounded-[20px] p-5 sm:p-6" style={{ background: BRAND.ink }} aria-live="polite">
        <div className="mx-auto w-16" aria-hidden="true">
          <AlienScanner />
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={topic.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="mt-4 flex flex-col gap-3"
          >
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm font-light text-black">{topic.ask}</p>
            {topic.reply.map((line, i) => (
              <motion.p
                key={line}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : 0.55 + i * 0.7, duration: 0.3 }}
                className="mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5 text-sm font-light text-white/90"
              >
                {line}
              </motion.p>
            ))}
          </motion.div>
        </AnimatePresence>
        <p className="mt-5 text-center text-[11px] font-light text-white/45">You choose what to share. Your match chats stay encrypted.</p>
      </div>
    </Panel>
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
