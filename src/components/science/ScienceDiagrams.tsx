import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Activity, Eye, Hand, MessageCircle, UserRound } from 'lucide-react';
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
  { id: 'backend', x: 240, label: 'OneHook', sub: 'is it really you?' },
  { id: 'ingest', x: 370, label: 'Ingest', sub: 'checked' },
] as const;
const HUB_SUB = 'in your order';
const ENGINE_X = 890;
const ENGINE_Y: Record<EngineId, number> = { engagement: LANE_Y - 80, rhythm: LANE_Y, meaning: LANE_Y + 80 };

export const SIGNALS: { kind: SignalKind; label: string; Icon: typeof Eye; caption: string }[] = [
  { kind: 'view', label: 'Profile view', Icon: Eye, caption: 'Only one mind is listening. Which one?' },
  { kind: 'swipe', label: 'Swipe', Icon: Hand, caption: 'Two minds hear this one, for different reasons.' },
  { kind: 'session', label: 'Session', Icon: Activity, caption: 'When you come and go says more than you think.' },
  { kind: 'chat', label: 'Message sent', Icon: MessageCircle, caption: 'That you replied, and when. Never the words.' },
  { kind: 'profile', label: 'Profile edit', Icon: UserRound, caption: 'Only your words matter here.' },
];

function enginePath(engine: EngineId): string {
  const y = ENGINE_Y[engine];
  return `M${HUB_X + 48} ${LANE_Y} C ${HUB_X + 190} ${LANE_Y}, ${ENGINE_X - 190} ${y}, ${ENGINE_X - 20} ${y}`;
}

/** The "+" chip: there are more signals than the five shown, and some reach every mind. */
export type DiagramSignal = SignalKind | 'more';
export const MORE_SIGNALS_CAPTION = 'And many more. Some reach every mind.';
const ALL_ENGINES: readonly EngineId[] = ['engagement', 'rhythm', 'meaning'];

/** Engines light up once the packet has travelled; re-runs on every "send". */
function useLitEngines(kind: DiagramSignal, pulse: number, reduce: boolean | null) {
  const targets = kind === 'more' ? ALL_ENGINES : ROUTES[kind];
  const [lit, setLit] = useState<readonly EngineId[]>(targets);
  useEffect(() => {
    if (reduce) {
      setLit(targets);
      return;
    }
    setLit([]);
    const t = window.setTimeout(() => setLit(targets), 1700);
    return () => window.clearTimeout(t);
  }, [pulse, targets, reduce]);
  return { targets, lit };
}

/** A mind on the diagram, drawn like the stage nodes: a small ring with a centre dot and its name
 *  underneath. It lights up in the mind's colour when the signal arrives. */
function EngineNode({ cx, cy, engine, on, fontSize }: { cx: number; cy: number; engine: EngineId; on: boolean; fontSize: number }) {
  const meta = ENGINE_META[engine];
  return (
    <g>
      <motion.circle
        cx={cx}
        cy={cy}
        r={18}
        initial={false}
        animate={{ fill: on ? meta.soft : '#FFFFFF', stroke: on ? meta.deep : 'rgba(10,11,16,0.3)' }}
        transition={{ duration: 0.35 }}
        strokeWidth={on ? 1.5 : 1}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        initial={false}
        animate={{ r: on ? 5 : 3.5, fill: on ? meta.deep : '#8F96A0' }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      />
      <text x={cx} y={cy + 18 + fontSize + 8} textAnchor="middle" fill={on ? meta.deep : BRAND.ink} fontSize={fontSize} fontWeight={600} style={{ transition: 'fill 350ms' }}>
        {meta.name}
      </text>
    </g>
  );
}

export function PipelineDiagram({ kind, pulse, caption }: { kind: DiagramSignal; pulse: number; caption: string }) {
  return (
    <>
      <div className="sm:hidden">
        <PipelineDiagramVertical kind={kind} pulse={pulse} caption={caption} />
      </div>
      <div className="hidden sm:block">
        <PipelineDiagramWide kind={kind} pulse={pulse} caption={caption} />
      </div>
      {/* The caption is drawn inside the diagram; this announces it to screen readers. */}
      <p className="sr-only" aria-live="polite">
        {caption}
      </p>
    </>
  );
}

/* Phone layout: the same journey read top to bottom on one centred axis — name to the left of
   each dot, detail to the right — so it is symmetric and every label stays legible. */
const V_X = 180;
const V_STAGE_Y = [34, 96, 158];
const V_HUB_Y = 246;
const V_ENGINE_Y = 350;
const V_ENGINE_X: Record<EngineId, number> = { engagement: 86, rhythm: 180, meaning: 274 };
const V_GAP = 30; // space between a dot and its two labels

function PipelineDiagramVertical({ kind, pulse, caption }: { kind: DiagramSignal; pulse: number; caption: string }) {
  const reduce = useReducedMotion();
  const { targets, lit } = useLitEngines(kind, pulse, reduce);
  const vPath = (e: EngineId) =>
    `M${V_X} ${V_HUB_Y + 40} C ${V_X} ${V_HUB_Y + 62}, ${V_ENGINE_X[e]} ${V_ENGINE_Y - 46}, ${V_ENGINE_X[e]} ${V_ENGINE_Y - 20}`;
  return (
    <svg viewBox="0 0 360 486" className="mx-auto h-auto w-full max-w-sm" role="img" aria-label={`A ${kind} signal travelling to: ${targets.map((t) => ENGINE_META[t].name).join(', ')}`}>
      <rect x={10} y={196} width={340} height={274} rx={28} fill="rgba(10,11,16,0.015)" stroke="rgba(10,11,16,0.07)" />
      <text x={180} y={426} textAnchor="middle" fill="rgba(10,11,16,0.6)" fontSize={12.5}>
        {caption}
      </text>
      <text x={180} y={450} textAnchor="middle" fill="rgba(10,11,16,0.4)" fontSize={10} letterSpacing={3} fontWeight={600}>
        STORED IN INDIA
      </text>

      <line x1={V_X} y1={V_STAGE_Y[0]} x2={V_X} y2={V_HUB_Y - 40} stroke="rgba(10,11,16,0.18)" strokeDasharray="2 7" />
      {ENGINE_ORDER.map((e) => {
        const on = targets.includes(e);
        return (
          <path key={e} d={vPath(e)} fill="none" stroke={on ? ENGINE_META[e].deep : 'rgba(10,11,16,0.12)'} strokeWidth={on ? 1.5 : 1} strokeDasharray={on ? undefined : '2 7'} style={{ transition: 'stroke 400ms' }} />
        );
      })}

      {STAGES.map((s, i) => (
        <g key={s.id}>
          <circle cx={V_X} cy={V_STAGE_Y[i]} r={18} fill="#FFFFFF" stroke="rgba(10,11,16,0.3)" />
          <circle cx={V_X} cy={V_STAGE_Y[i]} r={3.5} fill="#8F96A0" />
          <text x={V_X - V_GAP} y={V_STAGE_Y[i] + 5} textAnchor="end" fill={BRAND.ink} fontSize={15} fontWeight={600}>
            {s.label}
          </text>
          <text x={V_X + V_GAP} y={V_STAGE_Y[i] + 5} textAnchor="start" fill="rgba(10,11,16,0.5)" fontSize={13}>
            {s.sub}
          </text>
        </g>
      ))}

      <circle cx={V_X} cy={V_HUB_Y} r={40} fill="#FFFFFF" stroke="rgba(10,11,16,0.32)" />
      <image href={BRAND.logo} x={V_X - 26} y={V_HUB_Y - 26} width={52} height={52} />
      <text x={V_X - 52} y={V_HUB_Y + 5} textAnchor="end" fill={BRAND.ink} fontSize={15} fontWeight={600}>
        Event bus
      </text>
      <text x={V_X + 52} y={V_HUB_Y + 5} textAnchor="start" fill="rgba(10,11,16,0.5)" fontSize={13}>
        {HUB_SUB}
      </text>

      {ENGINE_ORDER.map((e) => {
        const on = lit.includes(e);
        const meta = ENGINE_META[e];
        return (
          <g key={e}>
            <EngineNode cx={V_ENGINE_X[e]} cy={V_ENGINE_Y} engine={e} on={on} fontSize={14} />
          </g>
        );
      })}

      {!reduce &&
        targets.map((e) => (
          <motion.circle
            key={`${pulse}-${e}`}
            r={5}
            fill={ENGINE_META[e].deep}
            initial={{ cx: V_X, cy: V_STAGE_Y[0], opacity: 0 }}
            animate={{
              cx: [V_X, V_X, V_X, V_X, V_ENGINE_X[e]],
              cy: [V_STAGE_Y[0], V_STAGE_Y[1], V_STAGE_Y[2], V_HUB_Y, V_ENGINE_Y - 20],
              opacity: [0, 1, 1, 1, 0],
            }}
            transition={{ duration: 1.7, ease: 'easeInOut', times: [0, 0.22, 0.44, 0.66, 1] }}
          />
        ))}
    </svg>
  );
}

function PipelineDiagramWide({ kind, pulse, caption }: { kind: DiagramSignal; pulse: number; caption: string }) {
  const reduce = useReducedMotion();
  const { targets, lit } = useLitEngines(kind, pulse, reduce);

  return (
    // Cropped to the drawn content (x 68–975, y 96–414) with equal margins, so it sits centred.
    <svg viewBox="48 80 947 350" className="mx-auto h-auto w-full max-w-4xl" role="img" aria-label={`A ${kind} signal travelling to: ${targets.map((t) => ENGINE_META[t].name).join(', ')}`}>
      {/* Mumbai residency envelope around everything the intelligence layer stores */}
      <rect x={305} y={96} width={670} height={318} rx={36} fill="rgba(10,11,16,0.015)" stroke="rgba(10,11,16,0.07)" />
      <text x={640} y={372} textAnchor="middle" fill="rgba(10,11,16,0.6)" fontSize={14}>
        {caption}
      </text>
      <text x={640} y={396} textAnchor="middle" fill="rgba(10,11,16,0.4)" fontSize={10} letterSpacing={4} fontWeight={600}>
        STORED IN INDIA
      </text>

      <line x1={STAGES[0].x} y1={LANE_Y} x2={HUB_X - 48} y2={LANE_Y} stroke="rgba(10,11,16,0.16)" strokeDasharray="2 7" />
      {ENGINE_ORDER.map((e) => {
        const on = targets.includes(e);
        return (
          <path
            key={e}
            d={enginePath(e)}
            fill="none"
            stroke={on ? ENGINE_META[e].deep : 'rgba(10,11,16,0.10)'}
            strokeOpacity={on ? 0.8 : 1}
            strokeWidth={on ? 1.5 : 1}
            strokeDasharray={on ? undefined : '2 7'}
            style={{ transition: 'stroke 400ms' }}
          />
        );
      })}

      {STAGES.map((s) => (
        <g key={s.id}>
          <circle cx={s.x} cy={LANE_Y} r={22} fill="#FFFFFF" stroke="rgba(10,11,16,0.28)" />
          <circle cx={s.x} cy={LANE_Y} r={3.5} fill="#8F96A0" />
          <text x={s.x} y={LANE_Y + 52} textAnchor="middle" fill={BRAND.ink} fontSize={14} fontWeight={600}>
            {s.label}
          </text>
          <text x={s.x} y={LANE_Y + 72} textAnchor="middle" fill="rgba(10,11,16,0.45)" fontSize={11.5}>
            {s.sub}
          </text>
        </g>
      ))}

      {/* Hub: the event bus, marked with the logo */}
      <circle cx={HUB_X} cy={LANE_Y} r={56} fill="none" stroke="rgba(10,11,16,0.10)" />
      <circle cx={HUB_X} cy={LANE_Y} r={46} fill="#FFFFFF" stroke="rgba(10,11,16,0.32)" />
      <image href={BRAND.logo} x={HUB_X - 30} y={LANE_Y - 30} width={60} height={60} />
      <text x={HUB_X} y={LANE_Y + 86} textAnchor="middle" fill={BRAND.ink} fontSize={14} fontWeight={600}>
        Event bus
      </text>
      <text x={HUB_X} y={LANE_Y + 106} textAnchor="middle" fill="rgba(10,11,16,0.45)" fontSize={11.5}>
        {HUB_SUB}
      </text>

      {ENGINE_ORDER.map((e) => {
        const on = lit.includes(e);
        const meta = ENGINE_META[e];
        return (
          <g key={e}>
            <EngineNode cx={ENGINE_X} cy={ENGINE_Y[e]} engine={e} on={on} fontSize={14} />
          </g>
        );
      })}

      {/* Travelling packets — keyed on `pulse` so every send restarts the animation. */}
      {!reduce &&
        targets.map((e) => (
          <motion.circle
            key={`${pulse}-${e}`}
            r={5}
            fill={ENGINE_META[e].deep}
            initial={{ cx: STAGES[0].x, cy: LANE_Y, opacity: 0 }}
            animate={{
              cx: [STAGES[0].x, STAGES[1].x, STAGES[2].x, HUB_X, ENGINE_X - 20],
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
