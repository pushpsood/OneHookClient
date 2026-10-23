import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { ArrowRight, Send, Smartphone } from 'lucide-react';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { Seo } from '../common/Seo';
import { ROUTE_SEO } from '../../config/seo-routes';
import { Accent, BRAND, Chapter, ENGINE_META, Kicker, Panel, labelClass, pillClass, type ChapterDef } from './ScienceUi';
import { Constellation, ErasureDemo, PipelineDiagram, SIGNALS } from './ScienceDiagrams';
import { ScienceHero } from './ScienceHero';
import { OrbitNav } from './OrbitNav';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import { EngagementLab, IntentLab, MeaningLab, MrOneHookLab, ProfileViewLab, ReplyLab, RhythmLab } from './ScienceLabs';
import type { EngineId, SignalKind } from './science-model';

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
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const [kind, setKind] = useState<SignalKind>('swipe');
  const [pulse, setPulse] = useState(0);
  const signal = SIGNALS.find((s) => s.kind === kind) ?? SIGNALS[0];

  const send = (k: SignalKind) => {
    setKind(k);
    setPulse((p) => p + 1);
  };

  return (
    <Chapter
      dark
      quote="Numbers do not fall in love. They just help two people notice each other."
      by="The idea behind it"
      chapter={CHAPTERS[1]}
      kicker="The journey"
      title={
        <>
          Milliseconds later, it is <Accent dark>on its way</Accent>
        </>
      }
      lede={
        <p>
          OneHook confirms the moment really came from you, checks it against a strict contract, and gives it a unique id so it can never
          count twice. Then it reaches the event bus, which keeps <em>your</em> moments in order, and fans out only to the minds that need
          it.
        </p>
      }
      handoff="So who are these three minds, and what does each one hear?"
    >
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Choose a signal to send">
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
                on ? 'border-white bg-white text-[#0A0B10]' : 'border-white/15 text-white/55 hover:border-white/40 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
            </button>
          );
        })}
      </div>

      <Panel dark className="mt-6">
        <PipelineDiagram kind={kind} pulse={pulse} />
        <div className="mt-6 flex flex-col items-center gap-5 text-center">
          <p className="max-w-xl text-sm font-light text-white/65" aria-live="polite">
            {signal.caption}
          </p>
          <button type="button" onClick={() => send(kind)} {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_send' })} className={pillClass('ghost-light')}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> Send again
          </button>
        </div>
      </Panel>

      <div className="mt-8 grid gap-px overflow-hidden rounded-[28px] border sm:grid-cols-3" style={{ borderColor: BRAND.hairlineDark, background: BRAND.hairlineDark }}>
        {[
          { k: 'Exactly once, in effect', v: 'Networks retry. Every moment carries one id, so a duplicate is recognised and ignored.' },
          { k: 'In your order', v: 'Your moments are processed in sequence, so a “close app” never overtakes the “open app” before it.' },
          { k: 'Nothing lost quietly', v: 'A moment that keeps failing is set aside for a person to inspect, never silently dropped.' },
        ].map((f) => (
          <div key={f.k} className="p-6 text-center" style={{ background: BRAND.ink }}>
            <p className="text-sm font-semibold">{f.k}</p>
            <p className="mx-auto mt-2 max-w-xs text-xs font-light leading-relaxed text-white/50">{f.v}</p>
          </div>
        ))}
      </div>
    </Chapter>
  );
}

/* ── Chapter 03: three minds (tabs) ────────────────────────────────────────── */

const MIND_ORDER: EngineId[] = ['engagement', 'rhythm', 'meaning'];
const MIND_COPY: Record<EngineId, { headline: string; body: string }> = {
  engagement: {
    headline: 'How much did that moment mean?',
    body: 'Engagement turns views, swipes and replies into a number between 0 and 1. It is how OneHook learns who genuinely interests whom, so the people who would light up at your profile meet you first.',
  },
  rhythm: {
    headline: 'How are you moving right now?',
    body: 'Rhythm watches pace, not people: how fast you swipe and how long you have been here today. When the pace stops being healthy, it recommends a calmer deck or a break, rather than pushing you to keep going.',
  },
  meaning: {
    headline: 'Who are you, in your own words?',
    body: 'Meaning reads your bio, interests and prompts and places you in a space of ideas, so two people who describe the same Sunday differently can still find each other.',
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
        <p>
          Instead of one giant algorithm, OneHook listens with three small, focused minds. Each owns a single question, keeps only what it needs
          to answer it, and can be explained in a sentence.
        </p>
      }
      handoff="A single moment is a whisper. Over time, the whispers become a voice."
    >
      <div className="flex justify-center">
        <div
          role="tablist"
          aria-label="The three minds"
          onKeyDown={onKey}
          data-track-exempt="duplicate: the arrow-key tab switch emits landing.demo_interact (science_tab) imperatively in onKey, mirroring each tab button's tracked click."
          className="inline-grid grid-cols-3 gap-1 rounded-full border p-1"
          style={{ borderColor: BRAND.hairlineLight }}
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
                className="rounded-full px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] transition-colors sm:px-8"
                style={on ? { background: ENGINE_META[id].color, color: BRAND.ink } : { color: 'rgba(10,11,16,0.5)' }}
              >
                {ENGINE_META[id].name}
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
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 rounded-[32px] border p-6 text-white sm:p-9"
        style={{ borderColor: `${meta.color}55`, background: `radial-gradient(120% 80% at 50% 0%, ${meta.soft}, transparent 70%), ${BRAND.ink}` }}
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className={labelClass} style={{ color: meta.color }}>
            {meta.name} · {meta.role}
          </p>
          <h3 className="mt-4 text-3xl font-light tracking-[-0.01em] sm:text-4xl">{copy.headline}</h3>
          <p className="mt-4 text-sm font-light leading-relaxed text-white/60 sm:text-base">{copy.body}</p>
        </div>
        <div className="mt-8">
          {tab === 'engagement' && <EngagementLab />}
          {tab === 'rhythm' && <RhythmLab />}
          {tab === 'meaning' && <MeaningLab />}
        </div>
      </motion.div>
    </Chapter>
  );
}

/* ── Chapter 06: promises ──────────────────────────────────────────────────── */

const PROMISES = [
  { k: 'Your words stay yours', v: 'The intelligence layer never receives the text of your messages. Only that one was sent, and how quickly.' },
  { k: 'Kept in India', v: 'Everything the three minds store lives in Google Cloud’s Mumbai region.' },
  { k: 'Built to forget', v: 'Moments expire after 30 days. Scores and intent are rebuilt fresh and expire within a day.' },
  { k: 'No outside AI reads you', v: 'Meaning runs its language model on OneHook’s own servers, not a third-party AI service.' },
  { k: 'Keyless by design', v: 'The clouds trust each other through short-lived, verified identities, not passwords in a file.' },
  { k: 'Explainable, always', v: 'Every rule on this page is a rule in the code. No black box decides who you meet.' },
];

function PromisesChapter() {
  const reduce = useReducedMotion();
  return (
    <Chapter
      dark
      quote="Help that never reads over your shoulder."
      by="Mr OneHook"
      chapter={CHAPTERS[5]}
      kicker="Promises"
      title={
        <>
          Intelligence, with <Accent dark>manners</Accent>
        </>
      }
      lede={
        <p>
          Knowing someone well is a privilege, so the system is built around limits. These are the ones that matter most, followed by the
          hardest one, demonstrated live: letting you go completely.
        </p>
      }
      handoff="Which brings us back to where we started."
    >
      <div className="grid gap-px overflow-hidden rounded-[28px] border sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: BRAND.hairlineDark, background: BRAND.hairlineDark }}>
        {PROMISES.map((p, i) => (
          <motion.div
            key={p.k}
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className="p-7 text-center"
            style={{ background: BRAND.ink }}
          >
            <p className="font-mono text-[10px] text-white/30">0{i + 1}</p>
            <p className="mt-3 text-lg font-light">{p.k}</p>
            <p className="mx-auto mt-2 max-w-xs text-sm font-light leading-relaxed text-white/50">{p.v}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-14 text-center">
        <Kicker dark>The right to be forgotten</Kicker>
        <h3 className="mx-auto mt-4 max-w-2xl text-3xl font-light tracking-[-0.01em] sm:text-4xl">
          Delete your account, and every mind <Accent dark>lets go</Accent>
        </h3>
        <div className="mt-8">
          <ErasureDemo />
        </div>
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
}: {
  body?: string;
  /** 'philosophy' → Our philosophy (Science page); 'invite' → Start with an invite (messenger). */
  secondary?: 'philosophy' | 'invite';
  /** Grow to fill a flex-column parent, with the content centred vertically (messenger closer). */
  fill?: boolean;
  /** Phones / low-memory devices: keep the photo and heartbeat logo, skip the endless ripples and the
   *  pulsing photo layer. */
  lite?: boolean;
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
      aria-labelledby="finale-title"
      className={`relative overflow-hidden px-6 py-16 text-white ${fill ? 'flex flex-1 flex-col justify-center' : ''} ${onScreen ? '' : 'oh-beat-paused'}`}
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
        <div ref={markRef} className="mx-auto w-full max-w-md">
          <Constellation converge={inView} beating={!reduce} className="h-auto w-full" />
        </div>
        <h2 id="finale-title" className="mx-auto mt-0 max-w-3xl text-4xl font-light leading-tight tracking-[-0.02em] sm:text-6xl">
          Thousands of quiet signals. <Accent dark>One</Accent> connection.
        </h2>
        <p className="mx-auto mt-5 max-w-xl font-light text-white/55">
          {body}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
  const ending = useFullScreenEnding();

  return (
    <div className="min-h-screen" style={{ background: BRAND.paper }}>
      <Seo {...ROUTE_SEO['/science']} path="/science" />
      <ProgressBar />
      <SiteHeader pageTitle="Science" />
      <OrbitNav chapters={CHAPTERS} onSelect={scrollToId} />

      <main>
        <ScienceHero onFollow={() => scrollToId('signal')} />

        <Chapter
          chapter={CHAPTERS[0]}
          kicker="A moment"
          title={
            <>
              It starts with <Accent>eighteen seconds</Accent>
            </>
          }
          lede={
            <p>
              You stop on a profile, open the third photo, read the bio, glance at a prompt. You have not swiped yet, but you have already said
              something. OneHook hears it as four small facts, never as a judgement of how anyone looks.
            </p>
          }
          handoff="That one moment is now a tiny, structured signal. Where does it go?"
        >
          <ProfileViewLab />
        </Chapter>

        <JourneyChapter />

        <MindsChapter />

        <Chapter
          dark
          quote="Time is the most honest thing you say."
          by="Reading intent"
          chapter={CHAPTERS[3]}
          kicker="Time & intent"
          title={
            <>
              Time is the most <Accent dark>honest</Accent> signal
            </>
          }
          lede={
            <p>
              Anyone can say they want something serious. How you spend your time says it for you: how quickly you reply, whether you start
              conversations, whether you read before you like. OneHook folds your own recent moments into one gentle reading of intent.
            </p>
          }
          handoff="Sometimes the best signal is knowing what to say next."
        >
          <div className="grid items-stretch gap-8 lg:grid-cols-2">
            <ReplyLab />
            <IntentLab />
          </div>
          <div className="mt-8 grid gap-px overflow-hidden rounded-[28px] border sm:grid-cols-3" style={{ borderColor: BRAND.hairlineLight, background: BRAND.hairlineLight }}>
            {[
              { k: 'When people are around', v: 'Someone usually here at this hour is shown sooner, so a match can become a conversation tonight.' },
              { k: 'Quiet threads', v: 'A conversation silent for three days is noticed, so the app can suggest a date idea instead of letting it fade.' },
              { k: 'A reset, not a slot machine', v: 'After a long run of likes with no match, the next card is someone likely to like you back.' },
            ].map((f) => (
              <div key={f.k} className="bg-white p-6 text-center text-accent">
                <p className="text-sm font-semibold">{f.k}</p>
                <p className="mx-auto mt-2 max-w-xs text-xs font-light leading-relaxed text-black/50">{f.v}</p>
              </div>
            ))}
          </div>
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
            <p>
              Tell Mr OneHook the kind of person you want, and about the profiles you liked most. Ask who to reply to, what to say or where
              to meet. He helps you think, and you decide.
            </p>
          }
          handoff="Every one of these choices comes from a short list of promises."
        >
          <MrOneHookLab />
        </Chapter>

        <PromisesChapter />
        {/* The finale carries the couple photo, so it reads as its own section after Promises. With
            the footer it fills exactly one screen, so the last scroll lands on a clean ending. */}
        <div className="flex flex-col" style={{ minHeight: ending.minHeight }}>
          <Finale fill />
        </div>
      </main>

      <div ref={ending.footerRef}>
        <SiteFooter />
      </div>

    </div>
  );
}
