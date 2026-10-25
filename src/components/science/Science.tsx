import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { ArrowRight, MoreHorizontal, Smartphone } from 'lucide-react';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { Seo } from '../common/Seo';
import { ROUTE_SEO } from '../../config/seo-routes';
import { Accent, BRAND, Chapter, ENGINE_META, Kicker, Panel, TryIt, labelClass, pillClass, type ChapterDef } from './ScienceUi';
import { Constellation, MORE_SIGNALS_CAPTION, PipelineDiagram, SIGNALS, type DiagramSignal } from './ScienceDiagrams';
import { ScienceHero } from './ScienceHero';
import { ScienceOverview } from './ScienceOverview';
import { OrbitNav } from './OrbitNav';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import { EngagementLab, IntentLab, MeaningLab, MrOneHookLab, ProfileViewLab, ReplyLab, RhythmLab } from './ScienceLabs';
import type { EngineId } from './science-model';

/**
 * /science — how OneHook Intelligence works, told as the journey of one signal.
 *
 * Narrative spine (each chapter hands off to the next):
 *   hero (three orbits around the logo) → 01 a single moment → 02 its journey → 03 the three minds
 *   → 04 time turns moments into intent → 05 Mr OneHook, someone to talk your matches through with
 *   → 06 the promises, including erasure → finale (every orbit collapses into the logo).
 *
 * Composition is deliberately symmetric: centred headings, mirrored hairlines, equal columns,
 * and the OneHook love logo as the fixed centre of every diagram.
 *
 * Every number in the interactive labs comes from ./science-model.ts, a faithful port of the
 * production engines. Every control is instrumented as `landing.demo_interact` (science_* values) in
 * the telemetry catalog.
 */

const CHAPTERS: ChapterDef[] = [
  { id: 'signal', number: '01', title: 'A moment' },
  { id: 'journey', number: '02', title: 'The journey' },
  { id: 'minds', number: '03', title: 'Three minds' },
  { id: 'time', number: '04', title: 'Time & intent' },
  { id: 'mr-onehook', number: '05', title: 'Mr OneHook' },
  { id: 'promises', number: '06', title: 'Promises' },
];

const guitarImage = '/media/man-playing-guitar-close-up-1600.jpg';
const cityImage = '/media/aerial-view-of-the-city-in-the-fog-5ZBZNUT-1600.jpg';
const webinarImage = '/media/photodune-33277756-pleased-redhead-woman-student-watches-training-webinar-1600.jpg';
const coupleImage = '/media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc-poster.jpg';


function scrollToId(id: string) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/* ── Reading progress + chapter rail (the page's continuity thread) ──────────── */

/** Thin bar across the top that fills as you read. Also used by the Messenger page, which passes a
 *  darker `background` because the default silver centre disappears on a light page. */
export function ProgressBar({ background }: { background?: string } = {}) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden="true"
      className="fixed left-0 right-0 top-0 z-50 h-[2px] origin-center"
      style={{
        scaleX,
        background: background ?? `linear-gradient(90deg, ${ENGINE_META.engagement.color}, ${BRAND.silver} 50%, ${ENGINE_META.meaning.color})`,
      }}
    />
  );
}

/* ── Full-bleed photographic interlude ─────────────────────────────────────── */

function Interlude({ image, quote, by }: { image: string; quote: string; by: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  // Gentle parallax: the photo drifts from -18% to 0% while the interlude crosses the viewport.
  const y = useTransform(scrollYProgress, [0, 1], ['-18%', '0%']);
  return (
    <div ref={ref} className="relative overflow-hidden bg-black py-14 sm:py-16">
      <motion.img
        src={image}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="absolute inset-0 h-[140%] w-full object-cover opacity-60 grayscale-[40%]"
        style={reduce ? undefined : { y }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-black/75" />
      <figure className="relative mx-auto flex max-w-4xl flex-col items-center justify-center px-6 text-center text-white">
        <img src={BRAND.logo} alt="" aria-hidden="true" className="mb-3 h-7 w-7 opacity-90" />
        <blockquote className="text-2xl font-light leading-snug tracking-[-0.01em] sm:text-4xl">“{quote}”</blockquote>
        <figcaption className="mt-3">
          <Kicker dark>{by}</Kicker>
        </figcaption>
      </figure>
    </div>
  );
}

/* ── Chapter 02: journey ───────────────────────────────────────────────────── */

function JourneyChapter() {
  const [kind, setKind] = useState<DiagramSignal>('swipe');
  const [pulse, setPulse] = useState(0);
  const caption = kind === 'more' ? MORE_SIGNALS_CAPTION : (SIGNALS.find((s) => s.kind === kind) ?? SIGNALS[0]).caption;

  const send = (k: DiagramSignal) => {
    setKind(k);
    setPulse((p) => p + 1);
  };

  return (
    <Chapter
      chapter={CHAPTERS[1]}
      kicker="The journey"
      title={
        <>
          Milliseconds later, it is <Accent>on its way</Accent>
        </>
      }
      lede={
        <p>
          Checked, then sent only where it is needed. Nowhere else.
        </p>
      }
      handoff="So who are these three minds, and what does each one hear?"
    >
      <Panel>
        <TryIt>Pick a signal and watch it travel.</TryIt>
        {/* Tapping a signal (even the current one) sends it again, so no separate replay button. */}
        <div className="mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Choose a signal to send">
          {SIGNALS.map(({ kind: k, label, Icon }) => {
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => send(k)}
                aria-pressed={on}
                {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_kind' })}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors ${
                  on ? 'border-[#0A0B10] bg-[#0A0B10] text-white' : 'border-black/10 text-black/55 hover:border-black/30 hover:text-black'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
              </button>
            );
          })}
          {/* "More": there are more signals than these five; this one reaches every mind. */}
          <button
            type="button"
            onClick={() => send('more')}
            aria-pressed={kind === 'more'}
            aria-label="More signals: one that reaches every mind"
            {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_kind' })}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors ${
              kind === 'more' ? 'border-[#0A0B10] bg-[#0A0B10] text-white' : 'border-black/10 text-black/55 hover:border-black/30 hover:text-black'
            }`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> More
          </button>
        </div>

        <div className="mt-5">
          <PipelineDiagram kind={kind} pulse={pulse} caption={caption} />
        </div>
      </Panel>
    </Chapter>
  );
}

/* ── Chapter 03: three minds (tabs) ────────────────────────────────────────── */

const MIND_ORDER: EngineId[] = ['engagement', 'rhythm', 'meaning'];
/** The "Try it" line at the top of the Three minds box, for the selected mind. */
const MIND_TRY: Record<EngineId, string> = {
  engagement: 'Pick a decision, then set the pause.',
  rhythm: 'Pick how someone uses the app.',
  meaning: 'Pick a pair and compare them.',
};
const MIND_COPY: Record<EngineId, { headline: string; body: string }> = {
  engagement: {
    headline: 'How much did that moment mean?',
    body: 'A view, a swipe, a reply. Each one quietly says how interested you really are.',
  },
  rhythm: {
    headline: 'How are you moving right now?',
    body: 'It watches your pace, never you, and knows when to suggest a breather.',
  },
  meaning: {
    headline: 'Who are you, in your own words?',
    body: 'It reads how you describe yourself, so kindred people can find each other.',
  },
};

function MindsChapter() {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<EngineId>('engagement');
  const tabRefs = useRef<Record<EngineId, HTMLButtonElement | null>>({ engagement: null, rhythm: null, meaning: null });

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = MIND_ORDER.indexOf(tab);
    const next = MIND_ORDER[(i + (e.key === 'ArrowRight' ? 1 : MIND_ORDER.length - 1)) % MIND_ORDER.length];
    // Arrow keys activate (not just focus) a tab, so this is a real selection — track it exactly as
    // a tab button's click does. Emitted imperatively because the keydown lives on the tablist
    // container, not on the selected tab, so the delegated click listener never sees it.
    trackUi(UiElement.LANDING_DEMO_INTERACT, { value: 'science_tab' });
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const meta = ENGINE_META[tab];
  const copy = MIND_COPY[tab];

  return (
    <Chapter
      chapter={CHAPTERS[2]}
      kicker="Three minds"
      title={
        <>
          One moment, heard <Accent>three ways</Accent>
        </>
      }
      lede={
        <p>Not one giant algorithm. Three small minds, each with a single question.</p>
      }
      handoff="A single moment is a whisper. Over time, the whispers become a voice."
    >
      {/* One restrained surface: fine border, underline navigation, editorial heading, compact demo. */}
      <div
        className="relative overflow-hidden rounded-[28px] border bg-white px-5 pb-6 pt-5 text-[#0A0B10] shadow-[0_24px_65px_-50px_rgba(10,11,16,0.38)] transition-colors duration-500 sm:px-8 sm:pb-8 sm:pt-6"
        style={{ borderColor: BRAND.hairlineLight }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-60 transition-colors duration-500"
          style={{ background: `linear-gradient(180deg, ${meta.soft}, transparent)` }}
        />
        <div className="relative">
          <TryIt>{MIND_TRY[tab]}</TryIt>
          <div className="mt-5 flex justify-center border-b border-black/[0.07]">
            <div
              role="tablist"
              aria-label="The three minds"
              onKeyDown={onKey}
              data-track-exempt="duplicate: the arrow-key tab switch emits landing.demo_interact (science_tab) imperatively in onKey, mirroring each tab button's tracked click."
              className="grid w-full max-w-xl grid-cols-3"
            >
              {MIND_ORDER.map((id) => {
                const on = tab === id;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      tabRefs.current[id] = el;
                    }}
                    id={`mind-tab-${id}`}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={`mind-panel-${id}`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => setTab(id)}
                    {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_tab' })}
                    className="relative whitespace-nowrap px-1 pb-3 pt-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/20 min-[340px]:text-[10px] min-[340px]:tracking-[0.12em] sm:tracking-[0.24em]"
                    style={{ color: on ? meta.deep : 'rgba(10,11,16,0.38)' }}
                  >
                    {ENGINE_META[id].name}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-4 -bottom-px h-[2px] rounded-full transition-all duration-300"
                      style={{ background: on ? meta.deep : 'transparent', transform: `scaleX(${on ? 1 : 0})` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <motion.div
            key={tab}
            id={`mind-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`mind-tab-${tab}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6"
          >
            <div className="mx-auto max-w-2xl text-center">
              <h3 className="text-3xl font-light leading-tight tracking-[-0.025em] sm:text-4xl">{copy.headline}</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm font-light leading-relaxed text-black/50">{copy.body}</p>
            </div>
            <div className="mt-6 border-t border-black/[0.06] pt-6">
              {tab === 'engagement' && <EngagementLab />}
              {tab === 'rhythm' && <RhythmLab />}
              {tab === 'meaning' && <MeaningLab />}
            </div>
          </motion.div>
        </div>
      </div>
    </Chapter>
  );
}

/* ── Chapter 06: promises ──────────────────────────────────────────────────── */

const PROMISES = [
  { k: 'Your words stay yours', v: 'Your messages are never read to match you.' },
  { k: 'Kept in India', v: 'What the three minds hold stays in India.' },
  { k: 'Built to forget', v: 'Every signal fades. Nothing is kept forever.' },
  { k: 'No outside AI reads you', v: 'Understanding happens on OneHook’s own servers.' },
  { k: 'Keyless by design', v: 'No passwords sitting in files.' },
  { k: 'Explainable, always', v: 'No black box decides who you meet.' },
];

function PromisesChapter() {
  const reduce = useReducedMotion();
  return (
    <Chapter
      chapter={CHAPTERS[5]}
      kicker="Promises"
      title={
        <>
          Intelligence, with <Accent>manners</Accent>
        </>
      }
      lede={
        <p>Knowing someone is a privilege. So the system is built around limits, including the hardest one: letting you go.</p>
      }
      handoff="Which brings us back to where we started."
    >
      <div className="grid gap-px overflow-hidden rounded-[28px] border sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: BRAND.hairlineLight, background: BRAND.hairlineLight }}>
        {PROMISES.map((p, i) => (
          <motion.div
            key={p.k}
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className="bg-white p-5 text-center"
          >
            {/* Numbered only when the cards sit side by side; stacked on a phone they read as a list. */}
            <p className="hidden font-mono text-[10px] text-black/30 sm:block">0{i + 1}</p>
            <p className="text-lg font-light sm:mt-3">{p.k}</p>
            <p className="mx-auto mt-2 max-w-xs text-sm font-light leading-relaxed text-black/50">{p.v}</p>
          </motion.div>
        ))}
      </div>
    </Chapter>
  );
}

/* ── Finale ────────────────────────────────────────────────────────────────── */

/**
 * "Thousands of quiet signals. One connection." — the heartbeat closer. Shared with the messenger
 * page, which passes its own supporting line and secondary action (the Science page keeps its own).
 */
/**
 * Sizes a page's closing section so that it and the footer below it fill exactly one screen under the
 * sticky header — the last scroll lands on a clean, full-screen ending. Attach `footerRef` to a
 * wrapper around the footer and give the closer's wrapper `style={{ minHeight }}`.
 */
export function useFullScreenEnding() {
  const footerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);
  const [footerH, setFooterH] = useState(0);
  useEffect(() => {
    const header = document.querySelector('header');
    const footer = footerRef.current;
    const measure = () => {
      setHeaderH(header ? Math.round(header.getBoundingClientRect().height) : 0);
      setFooterH(footer ? Math.round(footer.getBoundingClientRect().height) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (header) ro.observe(header);
    if (footer) ro.observe(footer);
    return () => ro.disconnect();
  }, []);
  // 100lvh = the full screen with the browser's toolbars collapsed. Unlike the live height it never
  // changes while scrolling, so nothing jumps when a phone browser shows or hides its toolbar.
  return { footerRef, minHeight: `calc(100lvh - ${headerH + footerH}px)` };
}

export function Finale({
  body = 'All of this exists so you can spend less time in a dating app, and more time with the one person worth leaving it for.',
  secondary = 'philosophy',
  fill = false,
  lite = false,
  showTitle = true,
  compact = false,
}: {
  body?: string;
  /** 'philosophy' → Our philosophy (Science page); 'invite' → Start with an invite (messenger). */
  secondary?: 'philosophy' | 'invite';
  /** Grow to fill a flex-column parent, with the content centred vertically (messenger closer). */
  fill?: boolean;
  /** Phones / low-memory devices: keep the photo and heartbeat logo, skip the endless ripples and the
   *  pulsing photo layer. */
  lite?: boolean;
  /** The "Thousands of quiet signals. One connection." headline (the messenger closer leaves it out). */
  showTitle?: boolean;
  /** Shorter closer: smaller heartbeat mark, headline and padding (Science page). */
  compact?: boolean;
} = {}) {
  const navigate = useNavigate();
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5, once: true });
  // The heartbeat is mounted once and only paused off-screen, so it never restarts mid-beat.
  const onScreen = useInView(sectionRef, { amount: 0.15 });

  // Ripples radiate from the logo, so find where the logo sits within the section.
  const [origin, setOrigin] = useState({ x: '50%', y: '30%' });
  useEffect(() => {
    const section = sectionRef.current;
    const mark = markRef.current;
    if (!section || !mark) return;
    const measure = () => {
      const s = section.getBoundingClientRect();
      const m = mark.getBoundingClientRect();
      const next = { x: `${m.left + m.width / 2 - s.left}px`, y: `${m.top + m.height / 2 - s.top}px` };
      setOrigin((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(section);
    return () => ro.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      {...(showTitle ? { 'aria-labelledby': 'finale-title' } : { 'aria-label': 'Get started' })}
      className={`relative overflow-hidden px-6 ${compact ? 'py-12 sm:py-14' : 'py-16'} text-white ${fill ? 'flex flex-1 flex-col justify-center' : ''} ${onScreen ? '' : 'oh-beat-paused'}`}
      style={{ background: BRAND.ink, ['--oh-origin' as string]: `${origin.x} ${origin.y}` }}
    >
      {/* The photo breathes very slightly with each beat, scaling from the logo (transform only). */}
      <img
        src={coupleImage}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={`${lite ? '' : 'oh-photo-pulse '}absolute inset-0 h-full w-full object-cover opacity-55`}
        style={{ filter: 'grayscale(40%)' }}
      />

      {/* A ripple is born on every "lub" and spreads through the photo over four beats. */}
      {!reduce && !lite && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-screen">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="oh-heart-ripple absolute block rounded-full"
              style={{
                left: origin.x,
                top: origin.y,
                width: 240,
                height: 240,
                marginLeft: -120,
                marginTop: -120,
                // Stagger by exactly one beat so a new ring starts on every heartbeat.
                animationDelay: `calc(var(--oh-beat) * ${i})`,
                background:
                  'radial-gradient(circle, transparent 50%, rgba(255,255,255,0.26) 60%, rgba(227,166,174,0.20) 66%, transparent 76%)',
              }}
            />
          ))}
        </div>
      )}

      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/45 to-black/85" />
      <div ref={ref} className="relative mx-auto max-w-5xl text-center">
        <div ref={markRef} className={`mx-auto w-full ${compact ? 'max-w-[13rem] sm:max-w-[16rem]' : 'max-w-md'}`}>
          <Constellation converge={inView} beating={!reduce} className="h-auto w-full" />
        </div>
        {showTitle && (
          <h2
            id="finale-title"
            className={`mx-auto mt-0 max-w-3xl font-light leading-tight tracking-[-0.02em] ${compact ? 'text-3xl sm:text-5xl' : 'text-4xl sm:text-6xl'}`}
          >
            Thousands of quiet signals. <Accent dark>One</Accent> connection.
          </h2>
        )}
        <p className={`mx-auto max-w-xl font-light text-white/55 ${compact ? 'mt-4' : 'mt-5'}`}>
          {body}
        </p>
        <div className={`flex flex-col items-center justify-center gap-3 sm:flex-row ${compact ? 'mt-6' : 'mt-8'}`}>
          <button type="button" onClick={() => navigate('/#get-app')} {...trackProps(UiElement.LANDING_OPEN_IN_APP)} className={pillClass('solid-light')}>
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Get the app
          </button>
          {secondary === 'invite' ? (
            // the Messenger closer: hidden on phones
            <button type="button" onClick={() => navigate('/redeem')} {...trackProps(UiElement.LANDING_GET_STARTED)} className={`${pillClass('ghost-light')} max-sm:!hidden`}>
              Start with an invite <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={() => navigate('/#philosophy')} {...trackProps(UiElement.LANDING_HOME_LINK)} className={pillClass('ghost-light')}>
              Our philosophy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export function Science() {
  return (
    <div className="min-h-screen" style={{ background: BRAND.paper }}>
      <Seo {...ROUTE_SEO['/science']} path="/science" />
      <ProgressBar />
      <SiteHeader pageTitle="Science" />
      <OrbitNav chapters={CHAPTERS} onSelect={scrollToId} />

      <main>
        <ScienceHero onFollow={() => scrollToId('science-overview')} />
        <ScienceOverview chapters={CHAPTERS} onSelect={scrollToId} />

        <Chapter
          chapter={CHAPTERS[0]}
          kicker="A moment"
          title={
            <>
              It starts with <Accent>eighteen seconds</Accent>
            </>
          }
          lede={
            <p>Before you swipe, you have already said something. OneHook hears it, without ever judging how anyone looks.</p>
          }
          handoff="That one moment is now a tiny, structured signal. Where does it go?"
        >
          <ProfileViewLab />
        </Chapter>

        <JourneyChapter />

        <MindsChapter />

        <Chapter
          chapter={CHAPTERS[3]}
          kicker="Time & intent"
          title={
            <>
              Time is the most <Accent>honest</Accent> signal
            </>
          }
          lede={
            <p>Anyone can say they want something serious. How you spend your time says it for you.</p>
          }
          handoff="Sometimes the best signal is knowing what to say next."
        >
          {/* One box: a single Try it, the two demos side by side, and the three notes at the foot. */}
          <Panel>
            <TryIt>Pick a reply time and a behaviour.</TryIt>
            <div className="mt-5 grid items-stretch gap-8 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-black/[0.06]">
              <div className="lg:pr-6">
                <ReplyLab />
              </div>
              <div className="border-t border-black/[0.06] pt-8 lg:border-t-0 lg:pl-6 lg:pt-0">
                <IntentLab />
              </div>
            </div>
            <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-3" style={{ borderColor: BRAND.hairlineLight, background: BRAND.hairlineLight }}>
              {[
                { k: 'When people are around', v: 'Good timing turns a match into a conversation.' },
                { k: 'Quiet threads', v: 'A fading conversation never fades unnoticed.' },
                { k: 'A reset, not a slot machine', v: 'A long dry spell is not ignored.' },
              ].map((f) => (
                <div key={f.k} className="bg-[#FAFAF8] p-4 text-center text-accent">
                  <p className="text-sm font-semibold">{f.k}</p>
                  <p className="mx-auto mt-2 max-w-xs text-xs font-light leading-relaxed text-black/50">{f.v}</p>
                </div>
              ))}
            </div>
          </Panel>
        </Chapter>

        <Chapter
          chapter={CHAPTERS[4]}
          kicker="Mr OneHook"
          title={
            <>
              Someone to <Accent>talk</Accent> it through with
            </>
          }
          lede={
            <p>Tell him what you are looking for. He helps you think. You decide.</p>
          }
          handoff="Every one of these choices comes from a short list of promises."
        >
          <MrOneHookLab />
        </Chapter>

        <PromisesChapter />
        <Finale compact />
      </main>

      <SiteFooter />
    </div>
  );
}
