import { useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { EngineId } from './science-model';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

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

export type ScienceChapterId = 'signal' | 'journey' | 'minds' | 'time' | 'mr-onehook' | 'promises';

export interface ChapterDef {
  id: ScienceChapterId;
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
      className={`relative scroll-mt-24 px-5 sm:px-6 ${continues ? 'pb-12 pt-2 sm:pb-14 sm:pt-4' : 'py-12 sm:py-14'}`}
      style={{ background: dark ? BRAND.ink : BRAND.paper, color: dark ? '#FFFFFF' : BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl">
        {/* Hairline separator: the light chapters are divided by a rule, not by colour blocks. */}
        {/* Number on top; the hairlines run either side of the section name below it. */}
        <div className="mb-6 sm:mb-7">
          <p className={`text-center font-mono text-xs tabular-nums ${dark ? 'text-white/40' : 'text-black/35'}`}>{chapter.number}</p>
          <div className="mt-2 flex items-center gap-4">
            <span aria-hidden="true" className={`h-px flex-1 ${dark ? 'bg-white/15' : 'bg-black/10'}`} />
            <p className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.32em] ${dark ? 'text-white/45' : 'text-black/40'}`}>
              {kicker}
            </p>
            <span aria-hidden="true" className={`h-px flex-1 ${dark ? 'bg-white/15' : 'bg-black/10'}`} />
          </div>
        </div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 id={`${chapter.id}-title`} className="text-3xl font-light leading-[1.1] tracking-[-0.02em] sm:text-5xl">
            {title}
          </h2>
          <div className={`mx-auto mt-3 max-w-2xl text-base font-light leading-relaxed ${dark ? 'text-white/60' : 'text-black/55'}`}>{lede}</div>
        </motion.div>

        <div className="mt-7 sm:mt-8">{children}</div>

        {handoff && (
          <p className={`mt-8 flex items-center justify-center gap-5 text-center text-sm font-light italic ${dark ? 'text-white/45' : 'text-black/45'}`}>
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
  inline = false,
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
  /** Label, slider and value on one line. */
  inline?: boolean;
}) {
  const id = useId();
  const shown = format ? format(value) : String(value);
  const labelEl = (
    <label
      htmlFor={id}
      className={`${
        inline ? 'whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.2em]' : LABEL
      } ${dark ? 'text-white/50' : 'text-black/45'}`}
    >
      {label}
    </label>
  );
  const input = (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-valuetext={shown}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${inline ? '' : 'mt-3 '}w-full cursor-pointer`}
      style={{ accentColor: accent }}
    />
  );
  if (inline) {
    // One row: label · slider · value. Fixed label and value columns keep every slider aligned.
    return (
      <div className="grid grid-cols-[7.5rem_1fr_3.25rem] items-center gap-3 sm:grid-cols-[10.5rem_1fr_3.5rem]">
        {labelEl}
        {input}
        <span className="text-right font-mono text-sm tabular-nums">{shown}</span>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        {labelEl}
        <span className="font-mono text-sm tabular-nums">{shown}</span>
      </div>
      {input}
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
      className={`rounded-[24px] border p-5 sm:p-6 ${dark ? 'bg-white/[0.025]' : 'bg-white text-[#0A0B10] shadow-[0_30px_80px_-50px_rgba(10,11,16,0.35)]'} ${className}`}
      style={{ borderColor: dark ? BRAND.hairlineDark : BRAND.hairlineLight }}
    >
      {children}
    </div>
  );
}

/** Pill button with one consistent, restrained style. */
export const pillClass = (variant: 'solid-light' | 'solid-dark' | 'ghost-light' | 'ghost-dark') =>
  `inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.28em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9FB1E8] focus-visible:ring-offset-2 disabled:opacity-40 ${
    {
      'solid-light': 'bg-white text-[#0A0B10] hover:bg-white/90',
      'solid-dark': 'bg-[#1F3A6B] text-white hover:bg-[#182F57]',
      'ghost-light': 'border border-white/20 text-white/75 hover:border-white/50 hover:text-white',
      'ghost-dark': 'border border-black/15 text-black/65 hover:border-black/40 hover:text-black',
    }[variant]
  }`;

export const labelClass = LABEL;

/** One plain-language instruction at the top of a demo, so visitors know what to do first. */
export function TryIt({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p
      className={`mx-auto flex items-center justify-center gap-2.5 whitespace-nowrap text-center text-[13px] font-light leading-none sm:text-sm ${dark ? 'text-white/70' : 'text-black/60'}`}
    >
      <span
        className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] ${dark ? 'bg-white/10 text-white/85' : 'bg-black/[0.06] text-black/65'}`}
      >
        Try it
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Ready-made scenarios: one tap shows a meaningful result before any slider is touched. */
export function Presets<T extends string>({
  label,
  options,
  value,
  onChange,
  dark = false,
  accent,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  /** null while the visitor has fine-tuned the values by hand. */
  value: T | null;
  onChange: (id: T) => void;
  dark?: boolean;
  accent: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-2">
      {options.map((option) => {
        const on = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.id)}
            {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_tab' })}
            className={`min-h-10 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              on
                ? ''
                : dark
                  ? 'border-white/15 text-white/65 hover:border-white/40 hover:text-white'
                  : 'border-black/10 text-black/60 hover:border-black/30 hover:text-black'
            }`}
            style={on ? { background: accent, borderColor: accent, color: dark ? BRAND.ink : '#FFFFFF' } : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Fine-tune" control: the detailed inputs stay one tap away instead of crowding the demo. */
export function Disclosure({
  label,
  open,
  onToggle,
  dark = false,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  dark?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex justify-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_tab' })}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors focus-visible:outline-none focus-visible:ring-2 ${
            dark ? 'text-white/60 hover:bg-white/[0.06] hover:text-white' : 'text-black/55 hover:bg-black/[0.05] hover:text-black'
          }`}
        >
          {open ? 'Done' : label}
          <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
      </div>
      {open && (
        <div id={id} className="mt-5">
          {children}
        </div>
      )}
    </div>
  );
}
