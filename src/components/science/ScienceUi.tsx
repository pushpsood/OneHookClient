import { useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { EngineId } from './science-model';

/** Brand tones sampled from the OneHook love logo (silver heart, navy "1"). */
export const BRAND = {
  ink: '#0A0B10',
  paper: '#FAFAF8',
  navy: '#1F3A6B',
  silver: '#C9CDD3',
  logo: '/media/onehook-512.png',
  /** Brushed-silver text, used for the single accent word in a headline. */
  silverText: 'linear-gradient(180deg,#FFFFFF 0%,#D9DDE2 45%,#8F96A0 100%)',
  hairlineDark: 'rgba(255,255,255,0.10)',
  hairlineLight: 'rgba(10,11,16,0.08)',
} as const;

/**
 * One muted tone per "mind" so a reader can follow a signal across chapters.
 * `color` reads on dark surfaces; `deep` is the same hue with enough contrast for light surfaces.
 */
export const ENGINE_META: Record<EngineId, { name: string; role: string; color: string; deep: string; soft: string }> = {
  engagement: { name: 'Engagement', role: 'How much a moment meant', color: '#E3A6AE', deep: '#A2525E', soft: 'rgba(227,166,174,0.10)' },
  rhythm: { name: 'Rhythm', role: 'How you are moving', color: '#D8B77C', deep: '#8A6A2E', soft: 'rgba(216,183,124,0.10)' },
  meaning: { name: 'Meaning', role: 'Who you are in words', color: '#9FB1E8', deep: '#1F3A6B', soft: 'rgba(159,177,232,0.10)' },
};

export interface ChapterDef {
  id: string;
  number: string;
  title: string;
}

/** Small-caps label flanked by symmetric hairlines. */
export function Kicker({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={`flex items-center justify-center gap-4 text-[10px] font-semibold uppercase tracking-[0.42em] ${dark ? 'text-white/45' : 'text-black/40'}`}>
      <span aria-hidden="true" className={`h-px w-12 ${dark ? 'bg-white/20' : 'bg-black/15'}`} />
      {children}
      <span aria-hidden="true" className={`h-px w-12 ${dark ? 'bg-white/20' : 'bg-black/15'}`} />
    </p>
  );
}

/** Headline accent: one word in Playfair italic, brushed silver on dark, navy on light. */
export function Accent({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className="font-serif italic pr-[0.12em] -mr-[0.06em]"
      style={
        dark
          ? { backgroundImage: BRAND.silverText, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
          : { color: BRAND.navy }
      }
    >
      {children}
    </span>
  );
}

/** Long-form chapter shell: centred number, kicker, headline and lede; body; symmetric hand-off line. */
export function Chapter({
  chapter,
  kicker,
  title,
  lede,
  children,
  handoff,
  dark = false,
  continues = false,
}: {
  chapter: ChapterDef;
  kicker: string;
  title: ReactNode;
  lede: ReactNode;
  children: ReactNode;
  handoff?: string;
  dark?: boolean;
  /** Follows a section of the same colour: skip the top padding so the gap is not doubled. */
  continues?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <section
      id={chapter.id}
      data-chapter={chapter.id}
      aria-labelledby={`${chapter.id}-title`}
      className={`relative scroll-mt-20 px-6 ${continues ? 'pb-16 pt-2 sm:pb-20 sm:pt-4' : 'py-16 sm:py-20'}`}
      style={{ background: dark ? BRAND.ink : BRAND.paper, color: dark ? '#FFFFFF' : BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className={`font-mono text-xs ${dark ? 'text-white/35' : 'text-black/30'}`}>{chapter.number}</p>
          <div className="mt-3">
            <Kicker dark={dark}>{kicker}</Kicker>
          </div>
          <h2 id={`${chapter.id}-title`} className="mt-5 text-4xl font-light leading-[1.08] tracking-[-0.02em] sm:text-6xl">
            {title}
          </h2>
          <div className={`mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed sm:text-lg ${dark ? 'text-white/60' : 'text-black/55'}`}>{lede}</div>
        </motion.div>

        <div className="mt-10 sm:mt-12">{children}</div>

        {handoff && (
          <p className={`mt-12 flex items-center justify-center gap-5 text-center text-sm font-light italic ${dark ? 'text-white/45' : 'text-black/45'}`}>
            <span aria-hidden="true" className={`hidden h-px w-20 sm:block ${dark ? 'bg-white/15' : 'bg-black/10'}`} />
            {handoff}
            <span aria-hidden="true" className={`hidden h-px w-20 sm:block ${dark ? 'bg-white/15' : 'bg-black/10'}`} />
          </p>
        )}
      </div>
    </section>
  );
}

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.28em]';

/** Labelled native range input (keyboard + screen-reader friendly). */
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  dark = false,
  accent = BRAND.navy,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  dark?: boolean;
  accent?: string;
}) {
  const id = useId();
  const shown = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className={`${LABEL} ${dark ? 'text-white/50' : 'text-black/45'}`}>
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums">{shown}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full cursor-pointer"
        style={{ accentColor: accent }}
      />
    </div>
  );
}

/** Accessible switch built on a native checkbox. */
export function Toggle({
  label,
  checked,
  onChange,
  dark = false,
  accent = BRAND.navy,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  dark?: boolean;
  accent?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4">
      <span className={`${LABEL} ${dark ? 'text-white/50' : 'text-black/45'}`}>{label}</span>
      <span className="relative inline-flex">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden="true"
          className={`h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 ${dark ? 'bg-white/15' : 'bg-black/10'}`}
          style={checked ? { backgroundColor: accent } : undefined}
        />
        <span aria-hidden="true" className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </label>
  );
}

/** Horizontal 0..1 meter with an optional threshold tick. */
export function Meter({
  value,
  color,
  threshold,
  dark = false,
  label,
}: {
  value: number;
  color: string;
  threshold?: number;
  dark?: boolean;
  label: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(value.toFixed(2))}
      className={`relative h-1.5 w-full overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-black/[0.06]'}`}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
      />
      {threshold !== undefined && (
        <span aria-hidden="true" className={`absolute top-0 h-full w-px ${dark ? 'bg-white' : 'bg-black'}`} style={{ left: `${threshold * 100}%` }} />
      )}
    </div>
  );
}

/** Card surface used by every lab. */
export function Panel({ children, dark = false, className = '' }: { children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <div
      className={`rounded-[28px] border p-6 sm:p-8 ${dark ? 'bg-white/[0.025]' : 'bg-white shadow-[0_30px_80px_-50px_rgba(10,11,16,0.35)]'} ${className}`}
      style={{ borderColor: dark ? BRAND.hairlineDark : BRAND.hairlineLight }}
    >
      {children}
    </div>
  );
}

/** Pill button with one consistent, restrained style. */
export const pillClass = (variant: 'solid-light' | 'solid-dark' | 'ghost-light' | 'ghost-dark') =>
  `inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.28em] transition-all disabled:opacity-40 ${
    {
      'solid-light': 'bg-white text-[#0A0B10] hover:bg-white/90',
      'solid-dark': 'bg-[#1F3A6B] text-white hover:bg-[#182F57]',
      'ghost-light': 'border border-white/20 text-white/75 hover:border-white/50 hover:text-white',
      'ghost-dark': 'border border-black/15 text-black/65 hover:border-black/40 hover:text-black',
    }[variant]
  }`;

export const labelClass = LABEL;
