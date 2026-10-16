import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Activity, Eye, Hand, MessageCircle, UserRound, Trash2 } from 'lucide-react';
import { BRAND, ENGINE_META, pillClass } from './ScienceUi';
import { ROUTES, type EngineId, type SignalKind } from './science-model';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

const ENGINE_ORDER: EngineId[] = ['engagement', 'rhythm', 'meaning'];

/* ──────────────────────────────────────────────────────────────────────────────
 * Constellation — three concentric orbits of signals around the OneHook logo.
 * Radially symmetric: each orbit is one mind, points evenly spaced, orbits counter-rotate.
 * Used twice (hero: orbiting; finale: collapsing into the logo) so the page opens and
 * closes on the same image.
 * ────────────────────────────────────────────────────────────────────────────── */

export const W = 800;
export const H = 560;
export const CX = W / 2;
export const CY = H / 2;
export const LOGO = 128;

export const ORBITS = ENGINE_ORDER.map((engine, i) => {
  const radius = 125 + i * 68;
  const count = 12 + i * 6;
  return {
    engine,
    radius,
    duration: 90 + i * 40,
    direction: i % 2 === 0 ? 1 : -1,
    points: Array.from({ length: count }, (_, k) => {
      const a = (k / count) * Math.PI * 2 - Math.PI / 2;
      return { k, x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius, r: k % 3 === 0 ? 3 : 1.8 };
    }),
  };
});

export const SPOKES = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);

/**
 * The heartbeat itself lives in CSS (index.css: `oh-heartbeat`, `--oh-beat` = 0.92 s, ~65 bpm) so the
 * logo, glow, ripples and photo share one compositor clock and cannot drift or stutter.
 */

export function Constellation({ converge, beating = false, className = '' }: { converge: boolean; beating?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const outer = ORBITS[ORBITS.length - 1].radius;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Three orbits of signals converging on the OneHook logo">
      <defs>
        <radialGradient id="sci-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="45%" stopColor={BRAND.silver} stopOpacity="0.06" />
          <stop offset="100%" stopColor={BRAND.ink} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={CX} cy={CY} r={outer + 20} fill="url(#sci-halo)" />

      {/* Hairline spokes — the symmetric scaffold */}
      <motion.g initial={false} animate={{ opacity: converge ? 0 : 1 }} transition={{ duration: 0.8 }}>
        {SPOKES.map((a, i) => (
          <line
            key={i}
            x1={CX + Math.cos(a) * (LOGO / 2 + 18)}
            y1={CY + Math.sin(a) * (LOGO / 2 + 18)}
            x2={CX + Math.cos(a) * (outer + 14)}
            y2={CY + Math.sin(a) * (outer + 14)}
            stroke="rgba(255,255,255,0.06)"
          />
        ))}
      </motion.g>

      {ORBITS.map((o, i) => (
        <motion.g
          key={o.engine}
          style={{ transformOrigin: `${CX}px ${CY}px`, transformBox: 'view-box' }}
          initial={false}
          animate={reduce || converge ? { rotate: 0 } : { rotate: 360 * o.direction }}
          transition={reduce || converge ? { duration: 0 } : { duration: o.duration, repeat: Infinity, ease: 'linear' }}
        >
          <motion.circle
            cx={CX}
            cy={CY}
            fill="none"
            stroke={ENGINE_META[o.engine].color}
            strokeOpacity={0.22}
            strokeDasharray="1 6"
            initial={false}
            animate={{ r: converge ? LOGO / 2 : o.radius, opacity: converge ? 0 : 1 }}
            transition={reduce ? { duration: 0 } : { duration: 1.4, delay: i * 0.12, ease: [0.65, 0, 0.35, 1] }}
          />
          {o.points.map((p) => (
            <motion.circle
              key={p.k}
              r={p.r}
              fill={ENGINE_META[o.engine].color}
              initial={false}
              animate={converge ? { cx: CX, cy: CY, opacity: 0 } : { cx: p.x, cy: p.y, opacity: p.r > 2 ? 0.95 : 0.55 }}
              transition={reduce ? { duration: 0 } : { duration: 1.4, delay: i * 0.12 + (p.k % 6) * 0.03, ease: [0.65, 0, 0.35, 1] }}
            />
          ))}
        </motion.g>
      ))}

      {/* The one */}
      <motion.g
        style={{ transformOrigin: `${CX}px ${CY}px`, transformBox: 'view-box' }}
        initial={false}
        animate={{ scale: converge ? 1.55 : 1 }}
        transition={reduce ? { duration: 0 } : { duration: 1.1, delay: converge ? 1.2 : 0, ease: [0.22, 1, 0.36, 1] }}
      >
        <circle cx={CX} cy={CY} r={LOGO / 2 + 10} fill="none" stroke="rgba(255,255,255,0.18)" />
        {/* A soft glow that swells on each beat (static blur; only its opacity animates) */}
        {beating && (
          <circle className="oh-heartglow" cx={CX} cy={CY} r={LOGO / 2 + 6} fill="rgba(227,166,174,0.30)" style={{ filter: 'blur(14px)' }} />
        )}
        {/* Heartbeat: lub · softer dub · long rest (CSS). Nested inside the converge scale so the two compose. */}
        <g className={beating ? 'oh-heartbeat' : undefined}>
          <motion.image
            href={BRAND.logo}
            x={CX - LOGO / 2}
            y={CY - LOGO / 2}
            width={LOGO}
            height={LOGO}
            animate={reduce || beating ? undefined : { opacity: [0.92, 1, 0.92] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </g>
      </motion.g>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Pipeline — the journey of one signal. Symmetric about the event bus (the logo hub):
 * three equally spaced stages in, three engines out, mirrored above and below the lane.
 * ────────────────────────────────────────────────────────────────────────────── */

const LANE_Y = 220;
const HUB_X = 500;
const STAGES = [
  { id: 'phone', x: 110, label: 'Your phone', sub: 'a quiet moment' },
  { id: 'backend', x: 240, label: 'OneHook', sub: 'verifies it is you' },
  { id: 'ingest', x: 370, label: 'Ingest', sub: 'checks · normalises' },
] as const;
const ENGINE_X = 890;
const ENGINE_Y: Record<EngineId, number> = { engagement: LANE_Y - 120, rhythm: LANE_Y, meaning: LANE_Y + 120 };

export const SIGNALS: { kind: SignalKind; label: string; Icon: typeof Eye; caption: string }[] = [
  { kind: 'view', label: 'Profile view', Icon: Eye, caption: 'Only Engagement listens: how long you lingered is about them, not your pace.' },
  { kind: 'swipe', label: 'Swipe', Icon: Hand, caption: 'Two minds hear it: Engagement weighs the decision, Rhythm watches your speed.' },
  { kind: 'session', label: 'Session', Icon: Activity, caption: 'Opening and closing the app shapes Rhythm (time today) and Engagement (when you are usually around).' },
  { kind: 'chat', label: 'Message sent', Icon: MessageCircle, caption: 'Engagement only sees that and when you replied. The words stay end-to-end encrypted, never here.' },
  { kind: 'profile', label: 'Profile edit', Icon: UserRound, caption: 'Only Meaning listens, and only re-reads you when your words actually changed.' },
];

function enginePath(engine: EngineId): string {
  const y = ENGINE_Y[engine];
  return `M${HUB_X + 48} ${LANE_Y} C ${HUB_X + 190} ${LANE_Y}, ${ENGINE_X - 190} ${y}, ${ENGINE_X - 48} ${y}`;
}

export function PipelineDiagram({ kind, pulse }: { kind: SignalKind; pulse: number }) {
  const reduce = useReducedMotion();
  const targets = ROUTES[kind];
  const [lit, setLit] = useState<readonly EngineId[]>(targets);

  // Light the engines once the packet has travelled; re-runs on every "send".
  useEffect(() => {
    if (reduce) {
      setLit(targets);
      return;
    }
    setLit([]);
    const t = window.setTimeout(() => setLit(targets), 1700);
    return () => window.clearTimeout(t);
  }, [pulse, targets, reduce]);

  return (
    <svg viewBox="0 0 1000 440" className="h-auto w-full" role="img" aria-label={`A ${kind} signal travelling to: ${targets.map((t) => ENGINE_META[t].name).join(', ')}`}>
      {/* Mumbai residency envelope around everything the intelligence layer stores */}
      <rect x={305} y={40} width={670} height={360} rx={36} fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.07)" />
      <text x={640} y={424} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={10} letterSpacing={4} fontWeight={600}>
        STORED IN MUMBAI, INDIA
      </text>

      <line x1={STAGES[0].x} y1={LANE_Y} x2={HUB_X - 48} y2={LANE_Y} stroke="rgba(255,255,255,0.16)" strokeDasharray="2 7" />
      {ENGINE_ORDER.map((e) => {
        const on = targets.includes(e);
        return (
          <path
            key={e}
            d={enginePath(e)}
            fill="none"
            stroke={on ? ENGINE_META[e].color : 'rgba(255,255,255,0.10)'}
            strokeOpacity={on ? 0.8 : 1}
            strokeWidth={on ? 1.5 : 1}
            strokeDasharray={on ? undefined : '2 7'}
            style={{ transition: 'stroke 400ms' }}
          />
        );
      })}

      {STAGES.map((s) => (
        <g key={s.id}>
          <circle cx={s.x} cy={LANE_Y} r={22} fill={BRAND.ink} stroke="rgba(255,255,255,0.28)" />
          <circle cx={s.x} cy={LANE_Y} r={3.5} fill={BRAND.silver} />
          <text x={s.x} y={LANE_Y + 52} textAnchor="middle" fill="#FFFFFF" fontSize={14} fontWeight={600}>
            {s.label}
          </text>
          <text x={s.x} y={LANE_Y + 72} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={11.5}>
            {s.sub}
          </text>
        </g>
      ))}

      {/* Hub: the event bus, marked with the logo */}
      <circle cx={HUB_X} cy={LANE_Y} r={56} fill="none" stroke="rgba(255,255,255,0.10)" />
      <circle cx={HUB_X} cy={LANE_Y} r={46} fill={BRAND.ink} stroke="rgba(255,255,255,0.32)" />
      <image href={BRAND.logo} x={HUB_X - 30} y={LANE_Y - 30} width={60} height={60} />
      <text x={HUB_X} y={LANE_Y + 86} textAnchor="middle" fill="#FFFFFF" fontSize={14} fontWeight={600}>
        Event bus
      </text>
      <text x={HUB_X} y={LANE_Y + 106} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={11.5}>
        in order, per person
      </text>

      {ENGINE_ORDER.map((e) => {
        const on = lit.includes(e);
        const meta = ENGINE_META[e];
        return (
          <g key={e}>
            <motion.circle
              cx={ENGINE_X}
              cy={ENGINE_Y[e]}
              initial={false}
              animate={{ r: on ? 48 : 43, opacity: on ? 1 : 0.5 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              fill={on ? meta.soft : 'rgba(255,255,255,0.02)'}
              stroke={meta.color}
              strokeOpacity={on ? 0.9 : 0.35}
              strokeWidth={1.25}
            />
            <text x={ENGINE_X} y={ENGINE_Y[e] + 4.5} textAnchor="middle" fill={on ? meta.color : 'rgba(255,255,255,0.4)'} fontSize={10.5} fontWeight={600} letterSpacing={1.2}>
              {meta.name}
            </text>
          </g>
        );
      })}

      {/* Travelling packets — keyed on `pulse` so every send restarts the animation. */}
      {!reduce &&
        targets.map((e) => (
          <motion.circle
            key={`${pulse}-${e}`}
            r={5}
            fill={ENGINE_META[e].color}
            initial={{ cx: STAGES[0].x, cy: LANE_Y, opacity: 0 }}
            animate={{
              cx: [STAGES[0].x, STAGES[1].x, STAGES[2].x, HUB_X, ENGINE_X - 48],
              cy: [LANE_Y, LANE_Y, LANE_Y, LANE_Y, ENGINE_Y[e]],
              opacity: [0, 1, 1, 1, 0],
            }}
            transition={{ duration: 1.7, ease: 'easeInOut', times: [0, 0.22, 0.44, 0.66, 1] }}
          />
        ))}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Reply curve — how a reply's timing becomes a signal (log time axis).
 * ────────────────────────────────────────────────────────────────────────────── */

export const CURVE_MIN_MIN = 1; // 1 minute
export const CURVE_MAX_MIN = 48 * 60; // 48 hours

export function ReplyCurve({ minutes, score, curve }: { minutes: number; score: number; curve: (m: number) => number }) {
  const PW = 640;
  const PH = 260;
  const PAD = 44;
  const lx = (m: number) => PAD + ((Math.log(m) - Math.log(CURVE_MIN_MIN)) / (Math.log(CURVE_MAX_MIN) - Math.log(CURVE_MIN_MIN))) * (PW - PAD * 2);
  const ly = (s: number) => PH - PAD - s * (PH - PAD * 2);

  const d = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 120; i += 1) {
      const m = Math.exp(Math.log(CURVE_MIN_MIN) + (i / 120) * (Math.log(CURVE_MAX_MIN) - Math.log(CURVE_MIN_MIN)));
      pts.push(`${i === 0 ? 'M' : 'L'}${lx(m).toFixed(1)} ${ly(curve(m)).toFixed(1)}`);
    }
    return pts.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve]);

  const ticks = [
    { m: 1, t: '1 min' },
    { m: 5, t: '5 min' },
    { m: 60, t: '1 h' },
    { m: 24 * 60, t: '24 h' },
    { m: 48 * 60, t: '48 h' },
  ];

  return (
    <svg viewBox={`0 0 ${PW} ${PH}`} className="h-auto w-full" role="img" aria-label={`Reply after ${minutes} minutes scores ${score.toFixed(2)}`}>
      <defs>
        <linearGradient id="sci-curve" x1="0" x2="1">
          <stop offset="0%" stopColor={ENGINE_META.engagement.deep} />
          <stop offset="100%" stopColor={BRAND.navy} />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={PAD} x2={PW - PAD} y1={ly(g)} y2={ly(g)} stroke="rgba(0,0,0,0.06)" />
          <text x={PAD - 10} y={ly(g) + 4} textAnchor="end" fontSize={10.5} fill="rgba(0,0,0,0.38)">
            {g.toFixed(1)}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t.t} x={lx(t.m)} y={PH - PAD + 22} textAnchor="middle" fontSize={10.5} fill="rgba(0,0,0,0.42)">
          {t.t}
        </text>
      ))}
      <path d={d} fill="none" stroke="url(#sci-curve)" strokeWidth={2.25} strokeLinecap="round" />
      <line x1={lx(minutes)} x2={lx(minutes)} y1={ly(0)} y2={ly(score)} stroke="rgba(0,0,0,0.2)" strokeDasharray="2 4" />
      <motion.circle
        initial={false}
        animate={{ cx: lx(minutes), cy: ly(score) }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        r={7}
        fill="#FFFFFF"
        stroke={BRAND.navy}
        strokeWidth={2}
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Erasure — the tombstone goes up first (centre), then every store lets you go.
 * ────────────────────────────────────────────────────────────────────────────── */

const STORES = [
  { id: 'signals', label: 'Moments', note: 'expire after 30 days', engine: 'engagement' as EngineId },
  { id: 'scores', label: 'Scores', note: 'expire after 24 hours', engine: 'engagement' as EngineId },
  { id: 'rhythm', label: 'Rhythm', note: 'last 50 swipes, 7 days', engine: 'rhythm' as EngineId },
  { id: 'intent', label: 'Intent', note: 'expires after 24 hours', engine: 'engagement' as EngineId },
  { id: 'meaning', label: 'Meaning', note: 'replaced when you change', engine: 'meaning' as EngineId },
];

export function ErasureDemo() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<'idle' | 'tombstone' | 'erasing' | 'done'>('idle');
  const [erased, setErased] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const run = () => {
    clear();
    const step = reduce ? 0 : 420;
    setErased(0);
    setPhase('tombstone');
    timers.current.push(window.setTimeout(() => setPhase('erasing'), step * 2));
    STORES.forEach((_, i) => timers.current.push(window.setTimeout(() => setErased(i + 1), step * (3 + i))));
    timers.current.push(window.setTimeout(() => setPhase('done'), step * (4 + STORES.length)));
  };

  const reset = () => {
    clear();
    setPhase('idle');
    setErased(0);
  };

  const status =
    phase === 'idle'
      ? 'Your data, as the three minds hold it.'
      : phase === 'tombstone'
        ? 'First, a tombstone goes up, so any signal still in flight is dropped on arrival.'
        : phase === 'erasing'
          ? 'Then every mind erases what it holds, and everyone your moments touched is scored afresh.'
          : 'Gone. Replaying the request changes nothing: every step is safe to repeat.';

  return (
    <div className="flex flex-col items-center">
      <motion.div
        initial={false}
        animate={{ opacity: phase === 'idle' ? 0.4 : 1, scale: phase === 'tombstone' ? 1.04 : 1 }}
        className="w-full max-w-xs rounded-3xl border p-5 text-center"
        style={{ borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.03)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45">Tombstone</p>
        <p className="mt-2 text-2xl font-light">{phase === 'idle' ? '—' : <span className="font-serif italic">Erased</span>}</p>
        <p className="mt-1 text-[11px] text-white/40">a one-way hash, never your id</p>
      </motion.div>

      <span aria-hidden="true" className="h-6 w-px bg-white/15" />
      <span aria-hidden="true" className="h-px w-full max-w-4xl bg-white/15" />

      <div className="mt-0 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-5">
        {STORES.map((s, i) => {
          const gone = erased > i;
          const color = ENGINE_META[s.engine].color;
          return (
            <div key={s.id} className="flex flex-col items-center">
              <span aria-hidden="true" className="hidden h-4 w-px bg-white/15 sm:block" />
              <motion.div
                initial={false}
                animate={{ opacity: gone ? 0.25 : 1, filter: gone && !reduce ? 'blur(1.5px)' : 'blur(0px)' }}
                transition={{ duration: 0.4 }}
                className="mt-3 w-full rounded-2xl border p-4 text-center sm:mt-0"
                style={{ borderColor: `${color}40`, background: `${color}0D` }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color }}>
                  {s.label}
                </p>
                <div className="mt-3 flex justify-center gap-1" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, d) => (
                    <span key={d} className="h-1.5 w-1.5 rounded-full" style={{ background: gone ? 'rgba(255,255,255,0.15)' : color }} />
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-white/45">{gone ? 'erased' : s.note}</p>
              </motion.div>
            </div>
          );
        })}
      </div>

      <div className="mt-7 flex flex-col items-center gap-4 text-center">
        <button
          type="button"
          onClick={phase === 'done' ? reset : run}
          disabled={phase === 'tombstone' || phase === 'erasing'}
          {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_erasure' })}
          className={pillClass(phase === 'done' ? 'ghost-light' : 'solid-light')}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {phase === 'done' ? 'Reset the demo' : 'Delete my account (demo)'}
        </button>
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="max-w-lg text-sm font-light text-white/65"
            aria-live="polite"
          >
            {status}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
