import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UiElement, trackProps } from '../lib/analytics/analytics';
import { MOST_POPULAR_TIER, PAID_TIER_NAMES } from '../config/membership.config';
import { APP_DOWNLOAD_URL, APP_STORE_LINKS } from '../config/signup.config';
import { motion, useInView, useMotionValue, useSpring, useScroll, useTransform, useReducedMotion, type MotionValue } from 'motion/react';
import {
  Heart,
  Focus,
  Lock,
  MessageCircle,
  Layers,
  Settings,
  User,
  Plus,
  Mic,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Check,
  Shuffle,
  ShieldCheck,
  QrCode,
  X,
  MapPin,
  Sparkles,
  HeartHandshake,
  Target,
  Radar,
  ArrowDown,
  Twitter,
  Instagram,
  Youtube,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { BrandWordmark } from './common/BrandWordmark';
import { Seo } from './common/Seo';
import { ROUTE_SEO } from '../config/seo-routes';
import { AppleIcon, AndroidIcon } from './common/BrandIcons';
import { SiteFooter } from './common/SiteFooter';
import { StickyCta } from './common/StickyCta';
import { AlienScanner } from './mascot';
import { hideMrOneHook } from './Chatbot/ChatbotWidget';
import { ScienceOrbitBackdrop } from './science/ScienceOrbitBackdrop';
import { useAppStore } from '../store/app-store';
import { getCognitoAuth } from '../lib/cognito-auth';

const focusIntentionImage = '/media/aerial-view-of-the-city-in-the-fog-5ZBZNUT-1600.jpg';
const discoverProfilesImage =
  '/media/man-with-backpack-walking-on-snow-covered-forest-b-JAJ77DS-1600.jpg';

const connectWithPurposeImage = '/media/man-playing-guitar-close-up-1600.jpg';
const getHookedImage =
  '/media/photodune-33277756-pleased-redhead-woman-student-watches-training-webinar-1600.jpg';
const heroVideoSource =
  '/media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc-1280.mp4';
const heroVideoPoster =
  '/media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc-poster.jpg';
const brandMarkImage = '/media/onehook-512.png';

/**
 * The QR code encodes the platform-aware smart link (app.onehook.club), because whoever scans it is on
 * an unknown device. The store badges link to their own store directly, or show "coming soon" while
 * that listing is unpublished (`APP_STORE_LINKS` is null).
 */
const STORE_BADGE_CLASS =
  'group inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-white/25 hover:bg-white hover:text-accent transition-colors';
const STORE_BADGE_SOON_CLASS =
  'inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-dashed border-white/20 opacity-60 cursor-default select-none';

/**
 * Mascot explainer video. Shown inside the "Under the hood" section when the
 * visitor clicks the mascot. Uses youtube-nocookie (no tracking cookies until
 * playback) which fits the product's privacy stance.
 */
const MASCOT_VIDEO_ID = 'Vphot1Wxvx8';
const MASCOT_VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${MASCOT_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&cc_load_policy=0`;

/**
 * Interactive "conversation starters" — the literal first message you'd send
 * your one match. This is the page's pattern-interrupt: it demonstrates the
 * product's whole point (intentional conversation) and invites the visitor to
 * imagine theirs.
 */
const OPENERS = [
  'What did you change your mind about this year?',
  'Chai ya coffee, and what does your order say about you?',
  'Sell me on your perfect Sunday.',
  'Batao, one thing you\u2019re low-key obsessed with right now?',
  'If we skipped the small talk, what should I actually ask you?',
  'Scene kya hai this weekend, plans ya total chill?',
  "What's a small thing that made you feel alive this week?",
  'Sabse underrated thing about your city?',
  'What are you paying attention to right now?',
  'Ek gaana that\u2019s always on your playlist, no skips?',
];

/**
 * Small-caps eyebrow flanked by symmetric hairlines. Mirrors the science route's `Kicker`, so the
 * landing and the science page share one editorial voice. Colour is inherited (`currentColor`) so it
 * works on both the dark hero and light sections.
 */
function Kicker({
  children,
  className = '',
  chapter,
}: {
  children: React.ReactNode;
  className?: string;
  /** Optional chapter number ("01"…): every section after the hero carries one, so the page reads
   *  as one continuous story rather than a stack of unrelated blocks. */
  chapter?: string;
}) {
  return (
    <p
      className={`flex items-center justify-center gap-3 text-[10px] font-semibold uppercase tracking-[0.4em] ${className}`}
    >
      <span aria-hidden="true" className="h-px w-8 bg-current opacity-40" />
      <span className="inline-flex items-center gap-2">
        {chapter && <span className="tabular-nums opacity-60">{chapter}</span>}
        {children}
      </span>
      <span aria-hidden="true" className="h-px w-8 bg-current opacity-40" />
    </p>
  );
}

/** One headline scale and one body scale for every chapter after the hero. */
const SECTION_TITLE = 'text-4xl md:text-6xl font-light tracking-tight leading-[1.08]';
const SECTION_LEAD = 'text-lg leading-relaxed max-w-2xl mx-auto';

/**
 * Text that swaps between versions without moving the layout: every version sits in the same grid
 * cell, so the box is always as tall as the longest one and the switch is a short crossfade.
 */
function SwapText<K extends string>({ active, versions }: { active: K; versions: Record<K, React.ReactNode> }) {
  return (
    <span className="grid">
      {(Object.keys(versions) as K[]).map((key) => (
        <span
          key={key}
          aria-hidden={key !== active}
          className={`[grid-area:1/1] transition-opacity duration-300 ${key === active ? 'opacity-100' : 'opacity-0'}`}
        >
          {versions[key]}
        </span>
      ))}
    </span>
  );
}

/**
 * Headline accent: a single word set in Playfair italic, used purely for impact against an otherwise
 * readable sans headline — the same "font as punctuation, not paragraph" idea the science route uses.
 * `silver` reads on the dark hero (brushed-metal gradient); `ink` reads on light sections.
 */
function Accent({ children, tone = 'silver' }: { children: React.ReactNode; tone?: 'silver' | 'ink' }) {
  if (tone === 'ink') {
    return <span className="font-serif italic text-accent pr-[0.08em] -mr-[0.04em]">{children}</span>;
  }
  return (
    <span
      className="font-serif italic pr-[0.1em] -mr-[0.05em]"
      style={{
        backgroundImage: 'linear-gradient(180deg,#FFFFFF 0%,#E6E9EE 45%,#9AA1AB 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * "Every hook starts with a sentence" — couple case studies
 *
 * Two categories, shown as two rows: couples who MET on OneHook, and couples who JOINED as a
 * couple. Every couple is still on OneHook (it launched in August 2026, so every story is weeks old),
 * and each card shows that status WITHOUT hovering; hovering/focusing reveals the fuller story.
 *
 * Every couple uses an anonymous, privacy-protecting illustration (two faceless silhouettes sharing
 * a heart, with a small lock badge) rather than a photo — real couples, identities protected while
 * their story is shared.
 * ───────────────────────────────────────────────────────────────────────────── */
/** Row category: how the couple came to OneHook. */
type CoupleOrigin = 'met' | 'couple';
/** Current status, shown on every card: still on OneHook, or moved on together. */
type CouplePresence = 'on' | 'off';

const ORIGIN_META: Record<CoupleOrigin, { label: string; Icon: typeof Heart }> = {
  met: { label: 'Met on OneHook', Icon: Heart },
  couple: { label: 'Joined as a couple', Icon: HeartHandshake },
};
const PRESENCE_META: Record<CouplePresence, { label: string; Icon: typeof Heart }> = {
  on: { label: 'Still on OneHook', Icon: MessageCircle },
  off: { label: 'Moved on, together', Icon: Check },
};

interface CoupleStory {
  id: string;
  /** Row category: how they came to OneHook. */
  origin: CoupleOrigin;
  /** Current status, always visible on the card. */
  presence: CouplePresence;
  /** The first line that started it. */
  opener: string;
  names: string;
  location: string;
  /** The fuller story, revealed on hover / focus. */
  story: string;
}

// OneHook launched in August 2026, so every timeline here fits inside the weeks since then.
const COUPLE_STORIES: readonly CoupleStory[] = [
  // Row 1 — Met on OneHook
  {
    id: 'aisha-rohan',
    origin: 'met',
    presence: 'on',
    opener: 'Chai ya coffee, and what does your order say about you?',
    names: 'Aisha & Rohan',
    location: 'New Delhi',
    story:
      'One honest question about chai became a three-hour call the same night in August. Ten weeks on, they still argue about the perfect cutting chai, and still talk every night.',
  },
  {
    id: 'noah-priya',
    origin: 'met',
    presence: 'on',
    opener: 'If we skipped the small talk, what should I actually ask you?',
    names: 'Noah & Priya',
    location: 'Faridabad',
    story:
      'They matched in their first week on OneHook and never reopened discovery. Two months in, it is still just the two of them, one conversation that keeps going.',
  },
  // Row 2 — Joined as a couple
  {
    id: 'dev-sara',
    origin: 'couple',
    presence: 'on',
    opener: 'Sell me on your perfect Sunday.',
    names: 'Dev & Sara',
    location: 'Gurugram',
    story:
      'Already together when they joined in August, they made OneHook their private, encrypted corner. The openers are now their weekly date-night game. Loser picks dinner.',
  },
  {
    id: 'meera-kabir',
    origin: 'couple',
    presence: 'on',
    opener: "What's a small thing that made you feel alive this week?",
    names: 'Meera & Kabir',
    location: 'Noida',
    story:
      'They joined together in September and kept OneHook as their private messenger. Six weeks of midnight openers in, they still trade one every night, and still answer honestly.',
  },
] as const;

/** Brand-only palettes (navy · brushed silver · pink): the front partner is always brushed silver;
 *  the partner behind and the card's navy tint vary so each couple still looks distinct. */
const ART_PALETTES = [
  { back: '#5B7DB8', glow: '#24447A' },
  { back: '#ff8fc7', glow: '#1F3A6B' },
  { back: '#9AA1AB', glow: '#2A4C86' },
  { back: '#3F63A3', glow: '#1A3263' },
] as const;

/**
 * Anonymous couple illustration: two faceless head-and-shoulder busts leaning into each other under
 * a small heart, with a privacy lock. It stands in for a photo without exposing anyone.
 *
 * Two layers, so nothing is ever stretched or cropped into giant shapes as the card widens:
 * - the backdrop is plain CSS (a navy glow on near-black), so it fills any card size;
 * - the figures are one SVG drawn with `meet`, so they keep their proportions and stay centred. They
 *   sit in the card's upper half and dissolve toward the bottom, so the text sits on calm ground.
 * Palette and mirroring vary by id so each couple still looks distinct.
 */
function CoupleIllustration({ id }: { id: string }) {
  const seed = Array.from(id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const { back, glow } = ART_PALETTES[seed % ART_PALETTES.length];
  const flip = seed % 2 === 1;
  const gid = `art-${id}`;
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: `radial-gradient(90% 70% at 50% 30%, ${glow} 0%, #111C33 55%, #0A0B10 100%)` }}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 200 220"
        preserveAspectRatio="xMidYMid meet"
        // Upper part of the card only: the opener, story and names below always sit on clear ground.
        className="absolute inset-x-0 top-[12%] h-[48%] w-full"
      >
        <defs>
          {/* brushed silver, lit from the top-left */}
          <linearGradient id={`${gid}-p`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#E6E9EE" />
            <stop offset="100%" stopColor="#9AA1AB" />
          </linearGradient>
          <linearGradient id={`${gid}-b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={back} stopOpacity="0.85" />
            <stop offset="100%" stopColor={back} stopOpacity="0.35" />
          </linearGradient>
          {/* the busts fade out toward the bottom instead of ending on a hard line */}
          <linearGradient id={`${gid}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="55%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={`${gid}-m`}>
            <rect width="200" height="220" fill={`url(#${gid}-fade)`} />
          </mask>
        </defs>
        <g mask={`url(#${gid}-m)`} transform={flip ? 'translate(200,0) scale(-1,1)' : undefined}>
          {/* partner behind, leaning in */}
          <g fill={`url(#${gid}-b)`}>
            <circle cx="80" cy="102" r="25" />
            <path d="M30 220 C30 168 54 146 80 146 C106 146 130 168 130 220 Z" />
          </g>
          {/* partner in front */}
          <g fill={`url(#${gid}-p)`}>
            <circle cx="120" cy="94" r="28" />
            <path d="M64 220 C64 162 92 138 120 138 C148 138 176 162 176 220 Z" />
          </g>
        </g>
        {/* small heart between them */}
        <path
          transform="translate(100,52) scale(0.62)"
          d="M0 8 C-8 -5 -26 1 -14 15 L0 28 L14 15 C26 1 8 -5 0 8 Z"
          fill="#ff8fc7"
        />
        {/* privacy lock, small, on the front partner's chest line */}
        <g transform="translate(100,186) scale(0.7)" opacity="0.9">
          <circle r="16" fill="#0A0B10" opacity="0.7" />
          <circle r="16" fill="none" stroke="#E6E9EE" strokeOpacity="0.5" strokeWidth="1.2" />
          <rect x="-6" y="-1" width="12" height="10" rx="2" fill="#E6E9EE" />
          <path d="M-3.5 -1 V-4.5 a3.5 3.5 0 0 1 7 0 V-1" fill="none" stroke="#E6E9EE" strokeWidth="1.8" />
        </g>
      </svg>
    </>
  );
}

/** Panel/chip backdrop: an anonymous, privacy-protecting couple illustration. Shape is set by the
 *  caller via `className` (e.g. `absolute inset-0` for a panel backdrop). */
function StoryPortrait({ story, className = '' }: { story: CoupleStory; className?: string }) {
  return (
    <div className={`overflow-hidden bg-[#0A0B10] ${className}`}>
      <CoupleIllustration id={story.id} />
    </div>
  );
}

/** One couple in the auto-advancing accordion. Two pills — how they came to OneHook, and whether
 *  they're still on it — show WITHOUT hovering. The spotlighted panel expands to reveal the story. */
function ExpandingCouplePanel({
  story,
  active,
  reduce,
  onActivate,
}: {
  story: CoupleStory;
  active: boolean;
  reduce: boolean;
  onActivate: () => void;
}) {
  const origin = ORIGIN_META[story.origin];
  const presence = PRESENCE_META[story.presence];
  const OriginIcon = origin.Icon;
  const PresenceIcon = presence.Icon;
  const labelVisibility = active ? 'inline' : 'hidden md:inline';
  return (
    <motion.button
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
      aria-pressed={active}
      aria-label={`${story.names} — ${origin.label}, ${presence.label}. See their story.`}
      {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'couple_story' })}
      initial={false}
      animate={{ flexGrow: active ? 5 : 1 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 28 }}
      // Phones: only the spotlighted couple shows, full width (four slivers were unreadable); the dots
      // below switch couples. md+: the accordion, where the others shrink to slim panels.
      className={`group relative h-full min-w-0 basis-0 overflow-hidden rounded-[1.5rem] border border-[#E6E9EE]/15 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ff8fc7] ${active ? 'block' : 'hidden md:block'}`}
    >
      <StoryPortrait story={story} className="absolute inset-0 h-full w-full" />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(10,11,16,0.95) 4%, rgba(10,11,16,0.45) 46%, rgba(10,11,16,0.05) 100%)' }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-20"
        style={{ background: 'radial-gradient(90% 100% at 50% 0%, rgba(255,143,199,0.28), transparent 70%)' }}
        initial={false}
        animate={{ opacity: active && !reduce ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between gap-2 p-3 md:p-4">
        {/* two pills: how they came to OneHook, and their current status */}
        <div className="flex flex-col items-start gap-1.5">
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#ff8fc7]/40 bg-[#0A0B10]/55 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[#ff8fc7] backdrop-blur-sm">
            <OriginIcon className="h-2.5 w-2.5 shrink-0" />
            <span className={`truncate ${labelVisibility}`}>{origin.label}</span>
          </span>
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#E6E9EE]/30 bg-[#0A0B10]/55 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[#E6E9EE] backdrop-blur-sm">
            <PresenceIcon className="h-2.5 w-2.5 shrink-0" />
            <span className={`truncate ${labelVisibility}`}>{presence.label}</span>
          </span>
        </div>

        <div className="min-w-0">
          {active ? (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <span className="mb-1 flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.14em]" style={{ color: '#ff8fc7' }}>
                <Heart className="h-2.5 w-2.5 shrink-0" fill="currentColor" /> the line that started it
              </span>
              <p className="line-clamp-3 text-lg font-light leading-snug text-white md:line-clamp-2 md:text-lg lg:text-xl">
                &ldquo;{story.opener}&rdquo;
              </p>
              {/* the fuller story only where there is room; on phones the hook itself gets the space */}
              <p className="mt-2 hidden text-sm leading-relaxed text-white/80 md:line-clamp-3 lg:text-[15px]">
                {story.story}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold text-white md:text-base">{story.names}</span>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-white/55">
                  <MapPin className="h-2.5 w-2.5 shrink-0" /> {story.location}
                </span>
              </div>
            </motion.div>
          ) : (
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{story.names}</span>
              <span className="mt-0.5 hidden items-center gap-0.5 truncate text-[10px] text-white/50 sm:flex">
                <MapPin className="h-2.5 w-2.5 shrink-0" /> {story.location}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

const HERO_WORDS = ['One', 'connection', 'Zero', 'distractions'] as const;
/** Let the hero's entrance animation finish before the first switch. */
const HERO_ACCENT_START_DELAY_MS = 1600;
/** Each hold is randomised inside this window so the rhythm never settles into a beat. */
const HERO_ACCENT_HOLD_MIN_MS = 1300;
const HERO_ACCENT_HOLD_MAX_MS = 2700;
/** How long a "misfire" flashes on the wrong word before the accent lands where it was going. */
const HERO_ACCENT_MISFIRE_MS = 110;
/** Chance that a hop briefly misfires onto another word first. */
const HERO_ACCENT_MISFIRE_CHANCE = 0.18;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const sign = () => (Math.random() < 0.5 ? -1 : 1);

/**
 * Next accent position. Mostly the very next word (keeps the sentence reading in order), but now
 * and then it skips one or two ahead, so the loop never looks mechanical.
 */
function nextHeroWord(current: number) {
  const r = Math.random();
  const step = r < 0.65 ? 1 : r < 0.9 ? 2 : 3;
  return (current + step) % HERO_WORDS.length;
}

/** Fresh slice positions / jitter direction for every glitch, consumed by the CSS keyframes. */
function glitchVars(): React.CSSProperties {
  const slice = () => `${Math.round(rand(8, 62))}%`;
  return {
    '--g-a1': slice(),
    '--g-b1': slice(),
    '--g-a2': slice(),
    '--g-b2': slice(),
    '--g-x': `${(sign() * rand(0.03, 0.07)).toFixed(3)}em`,
    '--g-c': `${(sign() * rand(0.03, 0.06)).toFixed(3)}em`,
  } as React.CSSProperties;
}

type HeroAccentState = {
  active: number;
  /** Word that just lost the accent and plays the short release jitter. */
  released: number | null;
  /** Per-transition randomness for the incoming glitch. */
  vars: React.CSSProperties;
  /** Bumped on every transition so the glitch restarts even if the same word repeats. */
  tick: number;
};

/**
 * Hero headline in which the Playfair accent hops between the four words with a short, sliced
 * chromatic glitch, pulling the eye across the whole promise. Order is mostly sequential, with
 * random skips, random hold times, occasional misfires and freshly randomised slices each time.
 *
 * Each word's box is sized to the form currently shown (measured, with a short width transition),
 * so spacing between words always matches normal text and the centred line eases rather than jumps.
 * Screen readers get the plain sentence once; reduced-motion users get the static "One" accent.
 */
/**
 * The three trust badges under the hero buttons: all on one line when they fit, otherwise one per
 * line — never an uneven two-and-one wrap. Decided from a hidden one-line copy's natural width.
 */
function HeroBadges() {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    const check = () => setStacked(measure.scrollWidth > box.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(box);
    document.fonts?.ready.then(check).catch(() => undefined);
    return () => ro.disconnect();
  }, []);
  const items = (
    <>
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <Lock className="w-3.5 h-3.5" /> End-to-end encrypted
      </span>
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <Focus className="w-3.5 h-3.5" /> One match at a time
      </span>
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <Sparkles className="w-3.5 h-3.5" /> Matched by science
      </span>
    </>
  );
  const type = 'text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-white/70';
  return (
    <div ref={boxRef} className={`relative mt-10 w-full ${type}`}>
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-x-6">
        {items}
      </div>
      <div className={`flex items-center justify-center ${stacked ? 'flex-col gap-y-2.5' : 'flex-row gap-x-6'}`}>{items}</div>
    </div>
  );
}

function HeroHeadline({ onLine2Width }: { onLine2Width?: (px: number) => void } = {}) {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<HeroAccentState>({ active: 0, released: null, vars: {}, tick: 0 });
  // Glitch classes apply only once cycling starts, so first paint is the clean static headline.
  const [cycling, setCycling] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const plainRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const accentRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [widths, setWidths] = useState<{ plain: number[]; accent: number[] } | null>(null);

  // Measure both forms of every word; re-measure on resize (fluid font size) and after webfonts load.
  useLayoutEffect(() => {
    const measure = () => {
      const read = (els: (HTMLSpanElement | null)[]) => HERO_WORDS.map((_, i) => els[i]?.offsetWidth ?? 0);
      const next = { plain: read(plainRefs.current), accent: read(accentRefs.current) };
      setWidths((prev) =>
        prev && prev.plain.join() === next.plain.join() && prev.accent.join() === next.accent.join() ? prev : next,
      );
    };
    measure();
    let alive = true;
    document.fonts?.ready.then(() => alive && measure());
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (headingRef.current) ro?.observe(headingRef.current);
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setState({ active: 0, released: null, vars: {}, tick: 0 });
      setCycling(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const moveTo = (target: number) =>
      setState((s) => ({ active: target, released: s.active, vars: glitchVars(), tick: s.tick + 1 }));

    const hop = (current: number) => {
      const target = nextHeroWord(current);
      const others = HERO_WORDS.map((_, i) => i).filter((i) => i !== current && i !== target);
      if (Math.random() < HERO_ACCENT_MISFIRE_CHANCE && others.length) {
        // Misfire: flick onto a wrong word for a beat, then land on the real target.
        moveTo(others[Math.floor(Math.random() * others.length)]);
        timer = setTimeout(() => {
          moveTo(target);
          schedule(target);
        }, HERO_ACCENT_MISFIRE_MS);
        return;
      }
      moveTo(target);
      schedule(target);
    };
    const schedule = (current: number) => {
      timer = setTimeout(() => hop(current), rand(HERO_ACCENT_HOLD_MIN_MS, HERO_ACCENT_HOLD_MAX_MS));
    };

    timer = setTimeout(() => {
      setCycling(true);
      hop(0);
    }, HERO_ACCENT_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  const word = (index: number) => {
    const isActive = index === state.active;
    const glitchOut = cycling && index === state.released ? ' oh-glitch-out' : '';
    const glitchIn = cycling ? ' oh-glitch-in' : '';
    const width = widths ? (isActive ? widths.accent[index] : widths.plain[index]) : undefined;
    return (
      <span
        className="inline-grid grid-cols-[minmax(0,1fr)] justify-items-center align-baseline transition-[width] duration-200 ease-out"
        style={width ? { width } : undefined}
      >
        <span
          key={`p-${index}-${glitchOut ? state.tick : 0}`}
          ref={(el) => {
            plainRefs.current[index] = el;
          }}
          className={`[grid-area:1/1] w-max transition-opacity duration-150 ${isActive ? 'opacity-0' : `opacity-100${glitchOut}`}`}
        >
          {HERO_WORDS[index]}
        </span>
        <span
          key={`a-${index}-${isActive ? state.tick : 0}`}
          ref={(el) => {
            accentRefs.current[index] = el;
          }}
          className={`[grid-area:1/1] w-max transition-opacity duration-150 ${isActive ? `opacity-100${glitchIn}` : 'opacity-0'}`}
          style={isActive ? state.vars : undefined}
        >
          <Accent tone="silver">{HERO_WORDS[index]}</Accent>
        </span>
      </span>
    );
  };

  // Width of the plain "Zero distractions." line (accent excluded, so it doesn't change as the accent
  // hops) — the hero's buttons are never allowed to be wider than it.
  const line2Ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = line2Ref.current;
    if (!el || !onLine2Width) return;
    const report = () => onLine2Width(Math.round(el.getBoundingClientRect().width));
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    document.fonts?.ready.then(report).catch(() => undefined);
    return () => ro.disconnect();
  }, [onLine2Width]);

  return (
    <h1
      ref={headingRef}
      className="relative font-light tracking-[-0.03em] leading-[1.03] text-white mb-6 drop-shadow-lg"
      style={{ fontSize: 'clamp(2.75rem, 8vw, 5.5rem)' }}
    >
      <span className="sr-only">
        OneHook — an intentional dating app for one meaningful connection at a time. One
        connection, zero distractions.
      </span>
      {/* whitespace-nowrap keeps each line on ONE line: when the italic accent lands on the wider
          word (e.g. "distractions") the line may overflow a little horizontally, but it never wraps
          to an extra line — so the headline height stays fixed and nothing below it shifts. */}
      <span aria-hidden="true" className="whitespace-nowrap">
        {word(0)} {word(1)}.
        <br />
        {word(2)} {word(3)}.
      </span>
      <span ref={line2Ref} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap">
        Zero distractions.
      </span>
    </h1>
  );
}

const PRINCIPLE_VALUES = [
  {
    icon: Focus,
    title: 'Intention',
    description: 'Every match is a choice, never a reflex.',
  },
  {
    icon: Lock,
    title: 'Constraint',
    description: 'One connection, so both of you show up.',
  },
  {
    icon: Heart,
    title: 'Authenticity',
    description: 'No backup options, so you can just be you.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy',
    description: 'What you two say stays between you two.',
  },
] as const;

/** The hover emphasis only applies where a real pointer can hover and the four cards sit in one row. */
const PRINCIPLE_HOVER_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
/** Column weight of the hovered card; the other three share the rest equally (1fr each). */
const PRINCIPLE_FOCUS_WEIGHT = 1.45;

/**
 * The four OneHook principles. Hovering a card gives it more room instead of transforming it:
 *
 * - Sideways: the grid's column weights animate, so the hovered column widens and the other three
 *   narrow proportionally. Nothing is scaled, so the shared dividers simply travel with the column
 *   edges — always one line, never hidden, never doubled.
 * - Downward: a transparent "drawer" grows out of the card's bottom edge, continuing its two
 *   dividers and closing with an accent rule. The top edge never moves, so nothing pokes upward.
 *
 * Cards stay transparent so the section artwork shows through. On touch and narrow screens the cards
 * stack with a single rule between rows and have no hover state.
 */
function PrincipleValues() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [canFocus, setCanFocus] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(PRINCIPLE_HOVER_QUERY);
    const sync = () => {
      setCanFocus(mq.matches);
      if (!mq.matches) setHovered(null);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const focused = canFocus ? hovered : null;
  const columns = PRINCIPLE_VALUES.map((_, i) => (i === focused ? `${PRINCIPLE_FOCUS_WEIGHT}fr` : '1fr')).join(' ');

  return (
    <div
      className="grid divide-y divide-border lg:grid-cols-4 lg:divide-y-0 lg:transition-[grid-template-columns] lg:duration-500 lg:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={canFocus ? { gridTemplateColumns: columns } : undefined}
      onMouseLeave={() => setHovered(null)}
    >
      {PRINCIPLE_VALUES.map((value, idx) => {
        const active = focused === idx;
        return (
          <div
            key={value.title}
            onMouseEnter={() => canFocus && setHovered(idx)}
            // min-w-0 lets a column narrow below its content's preferred width; the dividers are the
            // cells' own left edge, so they move with the columns and never overlap.
            className={`relative min-w-0 p-8 text-center lg:px-10 lg:py-12 ${idx > 0 ? 'lg:border-l lg:border-border' : ''}`}
          >
            <value.icon
              className={`mx-auto mb-6 h-6 w-6 text-accent transition-transform duration-500 ${active ? 'scale-110' : ''}`}
            />
            <h4 className="mb-3 text-lg font-bold uppercase tracking-[0.15em]">{value.title}</h4>
            <p
              // Reserve two lines on desktop: narrowed columns may rewrap to one more line, and the
              // row must not grow (and shove the page down) when that happens.
              className={`text-sm leading-relaxed transition-opacity duration-500 lg:min-h-[3.25em] ${active ? 'opacity-85' : 'opacity-60'}`}
            >
              {value.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Mask for the "Under the hood" backdrop, in three stacked layers:
 * 1. the curved top cap: the same ellipse as the cap's `clip-path: ellipse(100% 100% at 50% 100%)`;
 * 2. the solid body between cap and strip;
 * 3. the bottom strip, fading out ahead of the dark gradient strip it sits on.
 */
const UNDER_THE_HOOD_MASK = [
  'radial-gradient(100% 100% at 50% 100%, #000 99.5%, transparent 100%)',
  'linear-gradient(#000, #000)',
  // Fades out faster than the strip itself: light orbit lines would otherwise show on the white below.
  'linear-gradient(#000 0%, rgba(0,0,0,0.45) 30%, transparent 60%)',
].join(', ');
const UNDER_THE_HOOD_MASK_SIZE = '100% var(--cap), 100% calc(100% - var(--cap) - var(--fade) + 2px), 100% var(--fade)';
const UNDER_THE_HOOD_MASK_POSITION = '0 0, 0 calc(var(--cap) - 1px), 0 100%';

/** Dummy profile shown inside the manifesto phone — editorial, not a real member. */
const PHONE_PROFILE = {
  name: 'Isha',
  age: 27,
  location: 'Hauz Khas, New Delhi',
  distanceKm: 4,
  bio: 'Chai over coffee, long walks, and books I keep promising to finish. Here for one real conversation, not a hundred maybes.',
  photos: ['/media/profile-demo/profile-1.jpg', '/media/profile-demo/profile-2.jpg'],
  vitals: ['📍 4 km away', '172 cm', 'Serious', 'Non-smoker', 'New Delhi'],
  prompts: [
    { q: 'A boundary of mine is', a: 'Phones face-down at dinner.' },
    { q: 'We’ll get along if', a: 'you can defend chai vs coffee for an hour.' },
  ],
  interests: ['Travel', 'Film', 'Coffee', 'Yoga', 'Art', 'Live music'],
} as const;


const OH_INK = '#1A1A1A';
const OH_BORDER = '#EBEBEB';
const OH_RED = '#FF4444';

/** The OneHook iOS "hooked-heart + checkmark" verified mark, in brand ink (not iOS blue). */
function PhoneVerified({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return <ShieldCheck className={className} style={{ color: OH_INK }} />;
}

/** A per-element "comment to like" heart affordance — the Hinge-style like the iOS card uses. */
function LikeDot() {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white"
      style={{ borderColor: OH_BORDER }}
    >
      <Heart className="h-3.5 w-3.5" style={{ color: OH_INK }} />
    </span>
  );
}

/** Whose phone this is: the Profile tab shows the owner, not the match (Isha is Aarav's match). */
const PHONE_OWNER = { name: 'Aarav', age: 29, photo: '/media/profile-demo/profile-male-1.jpg' } as const;

/** A short one-connection thread for the Messages tab (mirrors the iOS chat detail). */
const PHONE_THREAD = [
  { me: false, t: 'Your prompt about chai vs coffee... I need the full argument 😄' },
  { me: true, t: 'Chai. Not even close. I’ll die on this hill.' },
  { me: false, t: 'Respect. First date = chai tapri then?' },
  { me: true, t: 'Hauz Khas, Sunday, 5pm. I’ll bring the debate.' },
  { me: false, t: 'It’s a date 🙂' },
] as const;

/** Rows for the Profile hub (mirrors the iOS ProfileViewController summary + sections). */
const PHONE_PROFILE_ROWS = [
  { label: 'Edit profile', hint: 'Photos · prompts · voice' },
  { label: 'Membership', hint: MOST_POPULAR_TIER.displayName },
  { label: 'Notifications', hint: '' },
  { label: 'Privacy & safety', hint: '' },
  { label: 'Appearance', hint: 'System' },
  { label: 'Help & support', hint: '' },
  { label: 'Settings', hint: '' },
] as const;

type PhoneTab = 'discover' | 'messages' | 'profile';

/**
 * A faithful OneHook-iOS device mock. The three-tab bar is interactive — Discover, Messages and
 * Profile each render their own screen, mirroring the app (DiscoverCardView, ChatDetailViewController,
 * ProfileViewController) in the shared visual language: near-white canvas, near-black heavy type, 1pt
 * hairlines, SHARP rectangles, red "hooked" accents. The Discover screen scrolls in lock-step with the
 * page (`scrollY`); the other screens are static. The only interactive controls are the three tabs
 * (tracked as a landing demo interaction).
 */
export function ManifestoPhone({
  progress,
  reduce,
  className,
  initialTab = 'discover',
  liveThread,
  liveDelay = 0,
  liveSpeed = 1,
  contactName = PHONE_PROFILE.name,
  contactPhoto = PHONE_PROFILE.photos[0],
  ownerName = PHONE_OWNER.name,
  ownerAge = PHONE_OWNER.age,
  ownerPhoto = PHONE_OWNER.photo,
  messagesOnly = false,
}: {
  progress: MotionValue<number>;
  reduce: boolean | null;
  /** Overrides the outer frame sizing. Defaults to the manifesto's large size. */
  className?: string;
  /** Which screen the phone opens on (the messenger page opens straight onto Messages). */
  initialTab?: PhoneTab;
  /** If set, the Messages screen plays this conversation live (typing dots, then each bubble). */
  liveThread?: readonly { me: boolean; t: string }[];
  /** Milliseconds before the live conversation starts (e.g. after an entrance animation). */
  liveDelay?: number;
  /** Playback speed multiplier for timings (e.g. 0.2 to "restore" a history quickly, no typing dots). */
  liveSpeed?: number;
  /** Who the Messages screen is talking to (defaults to the demo profile). */
  contactName?: string;
  contactPhoto?: string;
  /** Whose phone it is (shown on the Profile tab). Defaults to Aarav, Isha's match. */
  ownerName?: string;
  ownerAge?: number;
  ownerPhoto?: string;
  /** Messenger route: only the chat exists (Discover and Profile are never loaded), with a compact,
   *  bottom-anchored thread so the newest message always sits just above the text field. */
  messagesOnly?: boolean;
}) {
  const [tabState, setTab] = useState<PhoneTab>(messagesOnly ? 'messages' : initialTab);
  const tab: PhoneTab = messagesOnly ? 'messages' : tabState;
  // Live conversation playback: how many bubbles are revealed, and whether "typing…" is showing.
  const [revealed, setRevealed] = useState(liveThread ? 0 : Number.POSITIVE_INFINITY);
  const revealedRef = useRef(0);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!liveThread) return;
    // Continue from what is already on screen, so growing the thread only plays the new messages.
    const from = Math.min(revealedRef.current, liveThread.length);
    const timers: number[] = [];
    let t = liveDelay;
    liveThread.slice(from).forEach((m, k) => {
      const i = from + k;
      if (!m.me && liveSpeed >= 0.5) {
        timers.push(window.setTimeout(() => setTyping(true), t));
        t += (reduce ? 200 : 900) * liveSpeed;
      }
      timers.push(
        window.setTimeout(() => {
          setTyping(false);
          revealedRef.current = i + 1;
          setRevealed(i + 1);
        }, t)
      );
      t += (reduce ? 250 : 750) * liveSpeed;
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [liveThread, liveDelay, liveSpeed, reduce]);
  const thread = liveThread ?? PHONE_THREAD;
  // The active screen is a NATIVE scroll container. When the pointer is NOT on the device, the page
  // scroll drives its position; when the pointer IS on it, the visitor scrolls (and taps tabs) freely;
  // on pointer-leave we smoothly hand the position back to the page-driven one. Messages has no scroll.
  const screenRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hoveringRef = useRef(false);
  const pauseRef = useRef(false);

  useEffect(() => {
    if (reduce) return;
    const apply = (v: number) => {
      if (hoveringRef.current || pauseRef.current) return;
      const el = scrollerRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.min(Math.max(v, 0), 1) * (max > 0 ? max : 0);
    };
    apply(progress.get());
    return progress.on('change', apply);
  }, [progress, reduce, tab]);

  const handleScreenEnter = () => {
    hoveringRef.current = true;
  };
  const handleScreenLeave = () => {
    hoveringRef.current = false;
    if (reduce) return;
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const target = Math.min(Math.max(progress.get(), 0), 1) * (max > 0 ? max : 0);
    // Smoothly glide back to where the page scroll says we should be, instead of snapping.
    pauseRef.current = true;
    el.scrollTo({ top: target, behavior: 'smooth' });
    window.setTimeout(() => {
      pauseRef.current = false;
    }, 550);
  };

  const label = 'text-[9px] font-black uppercase tracking-[0.14em]';
  const muted = 'rgba(26,26,26,0.45)';
  const fade = reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 } };
  const hideScroll = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

  return (
    <div className={className ?? 'relative isolate mx-auto w-[256px] sm:w-[284px] lg:w-[min(23vw,400px)]'}>
      {/* ambient glow so the device reads as "lifted" off the dark panel */}
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 rounded-[3.2rem] bg-white/[0.07] blur-2xl" />

      {/* side buttons live OUTSIDE the clipped frame so their nubs still show */}
      <span aria-hidden="true" className="absolute -left-[2px] top-24 z-10 h-9 w-[3px] rounded-l bg-neutral-800" />
      <span aria-hidden="true" className="absolute -left-[2px] top-36 z-10 h-14 w-[3px] rounded-l bg-neutral-800" />
      <span aria-hidden="true" className="absolute -right-[2px] top-32 z-10 h-16 w-[3px] rounded-r bg-neutral-800" />

      {/* device frame — clips EVERYTHING inside to the bezel so nothing bleeds past the border */}
      <div className="relative overflow-hidden rounded-[2.9rem] border-[11px] border-neutral-950 bg-neutral-950 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.85)] ring-1 ring-white/10">
        {/* screen */}
        <div
          ref={screenRef}
          onMouseEnter={handleScreenEnter}
          onMouseLeave={handleScreenLeave}
          className="relative aspect-[9/19.5] overflow-hidden rounded-[2.25rem] bg-[#FDFDFD]"
          style={{ color: OH_INK }}
        >
          {/* ══════════ DISCOVER ══════════ */}
          {tab === 'discover' && (
            <motion.div key="discover" {...fade} className="absolute inset-0">
              {/* scroll container (page-driven when not hovered; free-scroll on hover) */}
              <div ref={scrollerRef} className={`absolute inset-0 z-0 overflow-y-auto overscroll-contain ${hideScroll}`} style={{ scrollbarWidth: 'none' }}>
                <div className="px-3 pb-[76px] pt-[92px]">
                  {/* Discover card */}
                  <div className="border bg-white" style={{ borderColor: OH_BORDER }}>
                    <div className="flex items-center gap-2.5 p-2.5">
                      <img src={PHONE_PROFILE.photos[0]} alt="" loading="lazy" decoding="async" className="h-11 w-11 shrink-0 object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[14px] font-black leading-none">{PHONE_PROFILE.name}, {PHONE_PROFILE.age}</span>
                          <PhoneVerified className="h-3 w-3" />
                        </div>
                        <p className={`mt-1 ${label}`} style={{ color: muted }}>{PHONE_PROFILE.distanceKm} km away</p>
                      </div>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: OH_BORDER, color: OH_RED }}>
                        <X className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="flex border-t text-center text-[9px] font-black uppercase tracking-[0.14em]" style={{ borderColor: OH_BORDER }}>
                      <span className="flex-1 border-b-2 py-2" style={{ borderColor: OH_INK, color: OH_INK }}>Photos</span>
                      <span className="flex-1 py-2" style={{ color: 'rgba(26,26,26,0.35)' }}>About</span>
                      <span className="flex-1 py-2" style={{ color: 'rgba(26,26,26,0.35)' }}>Interests</span>
                    </div>
                    <div className="relative">
                      <img src={PHONE_PROFILE.photos[0]} alt="" loading="lazy" decoding="async" className="h-[280px] w-full object-cover" />
                      <span className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md">
                        <Heart className="h-4 w-4" style={{ color: OH_INK }} />
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-2.5">
                      {PHONE_PROFILE.vitals.map((v) => (
                        <span key={v} className="border px-2 py-1 text-[9px] font-bold uppercase tracking-wider" style={{ borderColor: OH_BORDER, color: 'rgba(26,26,26,0.7)' }}>{v}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-start justify-between gap-2 border bg-white p-3" style={{ borderColor: OH_BORDER }}>
                    <div className="min-w-0">
                      <p className={label} style={{ color: muted }}>About</p>
                      <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(26,26,26,0.8)' }}>{PHONE_PROFILE.bio}</p>
                    </div>
                    <LikeDot />
                  </div>

                  {PHONE_PROFILE.prompts.map((p) => (
                    <div key={p.q} className="mt-2.5 flex items-start justify-between gap-2 border bg-white p-3" style={{ borderColor: OH_BORDER }}>
                      <div className="min-w-0">
                        <p className={label} style={{ color: muted }}>{p.q}</p>
                        <p className="mt-1 text-[12.5px] font-semibold" style={{ color: OH_INK }}>“{p.a}”</p>
                      </div>
                      <LikeDot />
                    </div>
                  ))}

                  <div className="mt-2.5 border bg-white p-3" style={{ borderColor: OH_BORDER }}>
                    <p className={label} style={{ color: muted }}>Interests</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {PHONE_PROFILE.interests.map((it) => (
                        <span key={it} className="border px-2 py-1 text-[9px] font-bold uppercase tracking-wider" style={{ borderColor: OH_BORDER, color: 'rgba(26,26,26,0.7)' }}>{it}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2.5 border bg-white p-2.5" style={{ borderColor: OH_BORDER }}>
                    <div className="relative">
                      <img src={PHONE_PROFILE.photos[1]} alt="" loading="lazy" decoding="async" className="h-44 w-full object-cover" />
                      <span className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md">
                        <Heart className="h-4 w-4" style={{ color: OH_INK }} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* brand header */}
              <div className="pointer-events-none absolute inset-x-0 top-11 z-20 flex h-11 items-center justify-between border-b bg-[#FDFDFD] px-3" style={{ borderColor: OH_BORDER }}>
                <div className="flex items-center gap-1.5">
                  <img src={brandMarkImage} alt="" className="h-5 w-5 object-contain" />
                  <span className="text-[14px] font-bold uppercase tracking-tighter" style={{ color: OH_INK }}>OneHook.</span>
                </div>
                <div className="flex items-center gap-3" style={{ color: OH_INK }}>
                  <span className="relative">
                    <Heart className="h-4 w-4" />
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full" style={{ background: OH_RED }} />
                  </span>
                  <Settings className="h-4 w-4" />
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════ MESSAGES ══════════ */}
          {tab === 'messages' && (
            <motion.div key="messages" {...fade} className="absolute inset-0">
              {/* chat header */}
              <div className="pointer-events-none absolute inset-x-0 top-11 z-20 flex h-12 items-center gap-2 border-b bg-[#FDFDFD] px-3" style={{ borderColor: OH_BORDER }}>
                <ArrowLeft className="h-4 w-4" style={{ color: OH_INK }} />
                <img src={contactPhoto} alt="" className="h-7 w-7 rounded-full object-cover" />
                <div className="leading-tight">
                  <p className="text-[12px] font-bold" style={{ color: OH_INK }}>{contactName}</p>
                  <p className="text-[8px] font-semibold" style={{ color: '#22C55E' }}>● Active now</p>
                </div>
              </div>

              {/* thread */}
              <div
                className={`absolute inset-x-0 top-[92px] bottom-[112px] flex flex-col overflow-hidden px-3 py-2 ${
                  messagesOnly ? 'justify-end gap-1.5' : 'gap-2'
                }`}
              >
                <div className="flex justify-center">
                  <span className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(26,26,26,0.06)', color: muted }}>Today</span>
                </div>
                {liveThread && (
                  <p className="flex items-center justify-center gap-1 text-[8px] font-semibold" style={{ color: muted }}>
                    <Lock className="h-2.5 w-2.5" /> Only the two of you can read this
                  </p>
                )}
                {thread.slice(0, revealed).map((m, i) => (
                  <motion.div
                    key={i}
                    initial={liveThread ? { opacity: 0, y: 10, scale: 0.94 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className={`flex ${m.me ? 'justify-end' : 'justify-start'}`}
                  >
                    <span
                      className={`max-w-[78%] rounded-2xl leading-snug ${messagesOnly ? 'px-2.5 py-1.5 text-[9.5px]' : 'px-3 py-2 text-[11px]'} ${m.me ? 'rounded-br-sm text-white' : 'rounded-bl-sm border'}`}
                      style={m.me ? { background: OH_INK } : { background: '#fff', borderColor: OH_BORDER, color: OH_INK }}
                    >
                      {m.t}
                    </span>
                  </motion.div>
                ))}
                {typing && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                    <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm border bg-white px-3 py-2.5" style={{ borderColor: OH_BORDER }}>
                      {[0, 1, 2].map((d) => (
                        <motion.span
                          key={d}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: muted }}
                          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: d * 0.15 }}
                        />
                      ))}
                    </span>
                  </motion.div>
                )}
              </div>

              {/* input bar */}
              <div className="absolute inset-x-0 bottom-16 z-20 flex items-center gap-2 border-t bg-[#FDFDFD] px-3 py-2.5" style={{ borderColor: OH_BORDER }}>
                <Plus className="h-4 w-4 shrink-0" style={{ color: muted }} />
                <div className="flex-1 rounded-full border px-3 py-1.5 text-[10px]" style={{ borderColor: OH_BORDER, color: muted }}>Message {contactName}…</div>
                <Mic className="h-4 w-4 shrink-0" style={{ color: OH_INK }} />
              </div>
            </motion.div>
          )}

          {/* ══════════ PROFILE ══════════ */}
          {tab === 'profile' && (
            <motion.div key="profile" {...fade} className="absolute inset-0">
              {/* title header */}
              <div className="pointer-events-none absolute inset-x-0 top-11 z-20 flex h-12 items-center justify-between border-b bg-[#FDFDFD] px-4" style={{ borderColor: OH_BORDER }}>
                <span className="text-[20px] font-black" style={{ color: OH_INK }}>Profile</span>
                <Settings className="h-4 w-4" style={{ color: OH_INK }} />
              </div>

              <div ref={scrollerRef} className={`absolute inset-x-0 bottom-16 top-[88px] z-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-5 ${hideScroll}`} style={{ scrollbarWidth: 'none' }}>
                <div className="flex flex-col items-center text-center">
                  <img src={ownerPhoto} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow-md" />
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-[15px] font-black" style={{ color: OH_INK }}>{ownerName}, {ownerAge}</span>
                    <PhoneVerified className="h-3.5 w-3.5" />
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-white" style={{ background: OH_INK }}>{MOST_POPULAR_TIER.displayName}</span>
                    <span className="rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider" style={{ borderColor: OH_BORDER, color: muted }}>Verified</span>
                  </div>
                </div>

                <div className="mt-5 border" style={{ borderColor: OH_BORDER }}>
                  {PHONE_PROFILE_ROWS.map((r, i) => (
                    <div
                      key={r.label}
                      className="flex items-center justify-between px-3 py-3"
                      style={i > 0 ? { borderTop: `1px solid ${OH_BORDER}` } : undefined}
                    >
                      <div>
                        <p className="text-[12px] font-semibold" style={{ color: OH_INK }}>{r.label}</p>
                        {r.hint && <p className="text-[9px]" style={{ color: muted }}>{r.hint}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4" style={{ color: muted }} />
                    </div>
                  ))}
                </div>

                <p className={`mt-5 ${label}`} style={{ color: muted }}>OneHook AI</p>
                <div className="mt-2 border p-3" style={{ borderColor: OH_BORDER }}>
                  <p className="text-[11px] font-bold" style={{ color: OH_INK }}>Mr OneHook</p>
                  <p className="mt-0.5 text-[9.5px] leading-relaxed" style={{ color: muted }}>Your AI wingmate. Reads meaning, not keywords. Included with {PAID_TIER_NAMES}.</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════ shared chrome ══════════ */}
          {/* status bar */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between bg-[#FDFDFD] px-5 pt-1">
            <span className="text-[10px] font-semibold" style={{ color: OH_INK }}>9:41</span>
            <span className="flex items-center gap-1" style={{ color: OH_INK }}>
              <span className="flex items-end gap-[1.5px]">
                <span className="h-1.5 w-[2px] rounded-sm bg-current" />
                <span className="h-2 w-[2px] rounded-sm bg-current" />
                <span className="h-2.5 w-[2px] rounded-sm bg-current" />
                <span className="h-3 w-[2px] rounded-sm bg-current opacity-40" />
              </span>
              <span className="ml-1 flex h-2.5 w-5 items-center rounded-[3px] border px-[1px]" style={{ borderColor: 'rgba(26,26,26,0.7)' }}>
                <span className="h-1.5 w-3 rounded-[1px] bg-current" />
              </span>
            </span>
          </div>
          {/* dynamic island */}
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 z-40 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />

          {/* interactive bottom tab bar */}
          <div className="absolute inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t bg-[#FDFDFD] px-2 pb-3" style={{ borderColor: OH_BORDER }}>
            {messagesOnly ? (
              <span aria-hidden="true" className="flex flex-1 items-center justify-center">
                <Layers className="h-[22px] w-[22px]" style={{ color: 'rgba(26,26,26,0.4)' }} strokeWidth={2} />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setTab('discover')}
                aria-label="Discover"
                {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'preview_discover' })}
                className="flex flex-1 cursor-pointer items-center justify-center"
              >
                <Layers className="h-[22px] w-[22px]" style={{ color: tab === 'discover' ? OH_INK : 'rgba(26,26,26,0.4)' }} strokeWidth={tab === 'discover' ? 2.4 : 2} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setTab('messages')}
              aria-label="Messages"
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'preview_messages' })}
              className="flex flex-1 cursor-pointer items-center justify-center"
            >
              <MessageCircle className="h-[22px] w-[22px]" style={{ color: tab === 'messages' ? OH_INK : 'rgba(26,26,26,0.4)' }} strokeWidth={tab === 'messages' ? 2.4 : 2} />
            </button>
            {messagesOnly ? (
              <span aria-hidden="true" className="flex flex-1 items-center justify-center">
                <User className="h-[22px] w-[22px]" style={{ color: 'rgba(26,26,26,0.4)' }} strokeWidth={2} />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setTab('profile')}
                aria-label="Profile"
                {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'preview_profile' })}
                className="flex flex-1 cursor-pointer items-center justify-center"
              >
                <User className="h-[22px] w-[22px]" style={{ color: tab === 'profile' ? OH_INK : 'rgba(26,26,26,0.4)' }} strokeWidth={tab === 'profile' ? 2.4 : 2} />
              </button>
            )}
          </div>
          {/* home indicator */}
          <div aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1/2 z-40 h-1 w-24 -translate-x-1/2 rounded-full" style={{ background: 'rgba(26,26,26,0.3)' }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Single / Seeing someone switch for "How it works". The two flows differ, so the choice must not be
 * missed: when the section comes into view it asks "Which one are you?" and a soft pink ring keeps
 * pulsing around the switch, and the inactive option gently glows, until the visitor picks one.
 * After the first pick it is a plain, quiet switch. Reduced motion: the prompt only, no pulse.
 */
function RelationshipToggle({
  mode,
  onChange,
}: {
  mode: 'single' | 'taken';
  onChange: (mode: 'single' | 'taken') => void;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const [chosen, setChosen] = useState(false);
  const calling = inView && !chosen;
  const options = [
    { key: 'single', label: 'Single' },
    { key: 'taken', label: 'Seeing someone' },
  ] as const;
  return (
    <div ref={ref} className="mt-8 flex flex-col items-center">
      <motion.p
        initial={false}
        // fades out once chosen but keeps its space, so nothing below jumps when the visitor clicks
        animate={{ opacity: chosen ? 0 : 1 }}
        transition={{ duration: 0.35 }}
        aria-hidden={chosen}
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#c2185b]"
      >
        First, which one are you?
      </motion.p>
      <div className="relative">
        {/* the call for attention: a pink ring that breathes out from the switch */}
        {calling && !reduce && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-full border-2 border-[#ff8fc7]"
            initial={{ opacity: 0.8, scale: 1 }}
            animate={{ opacity: [0.8, 0], scale: [1, 1.18] }}
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' }}
          />
        )}
        <div
          role="tablist"
          aria-label="Choose your relationship status"
          className={`relative inline-flex items-center rounded-full border bg-white p-1 transition-[border-color,box-shadow] duration-500 ${
            calling ? 'border-[#ff8fc7] shadow-[0_10px_30px_-12px_rgba(255,105,180,0.6)]' : 'border-border'
          }`}
        >
          {options.map((option) => {
            const isActive = mode === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setChosen(true);
                  onChange(option.key);
                }}
                {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'relationship_mode' })}
                className={`relative rounded-full px-6 py-2.5 text-xs font-black uppercase tracking-[0.2em] transition-all ${
                  isActive ? 'bg-accent text-white shadow-sm' : 'text-text/55 hover:text-text/85'
                }`}
              >
                {/* the option not yet chosen glows softly, so it reads as a real alternative */}
                {calling && !isActive && !reduce && (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full bg-[#ff8fc7]/20"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <span className="relative">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const storeLogout = useAppStore((state) => state.logout);

  // Full sign-out: end the Amplify/Cognito session (so a page reload doesn't silently
  // re-authenticate) and clear local app state. We're already on the landing page, so no navigate.
  const handleLogout = async () => {
    try {
      await getCognitoAuth().logout();
    } catch {
      // Ignore — clear local state regardless so the UI reflects a signed-out session.
    }
    storeLogout();
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const underTheHoodRef = useRef<HTMLDivElement>(null);
  const exploreScienceRef = useRef<HTMLButtonElement>(null);
  // Hovering / focusing "Explore the science" brings the science backdrop into focus.
  const [scienceRevealed, setScienceRevealed] = useState(false);

  // The ScienceOrbitBackdrop is a heavy, pointer-driven decoration (a large rotating blurred aurora,
  // a persistent blur over an animated SVG, a composited mask, and autoplaying signal pulses). On
  // phones this spikes GPU/memory and makes mobile Safari/Chrome reload or crash when the Mr OneHook
  // section scrolls into view — and the pointer parallax it exists for cannot even happen on touch.
  // So mount it only on a large viewport with a real (fine) pointer; it is purely decorative.
  const [enableOrbitBackdrop, setEnableOrbitBackdrop] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px) and (pointer: fine)');
    const sync = () => setEnableOrbitBackdrop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // ── Philosophy manifesto: a scroll-linked "zoom to read" ───────────────────────
  // Draws the eye to "…make one of them count." as the block travels through the viewport.
  // Both transforms are safe against overlap: the backdrop zoom is clipped by the section's
  // `overflow-hidden`, and the line only grows UP TO its natural size (max scale 1), so it can
  // never spill past its own layout box. Disabled entirely under reduced-motion.
  const prefersReducedMotion = useReducedMotion();
  const manifestoRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: manifestoProgress } = useScroll({
    target: manifestoRef,
    // Scroll-linked animation runs only while the panel is ENTERING: progress 0 when the panel's centre
    // reaches the viewport bottom (half on screen) and 1 when the panel's BOTTOM reaches the viewport
    // bottom (the whole element is on screen). Past that, progress stays pinned at 1 — further scrolling
    // adds no new animation; only pointer movement still tilts the device.
    offset: ['center end', 'end end'],
  });
  // Cinematic Ken-Burns push-in on the photo backdrop (clipped — purely atmospheric).
  const manifestoImgScaleRaw = useTransform(manifestoProgress, [0, 1], [1.08, 1.26]);
  const manifestoImgScale = useSpring(manifestoImgScaleRaw, { stiffness: 100, damping: 30, mass: 0.4 });
  // The headline line grows into focus and brightens as it nears centre, settling at full size.
  const manifestoTextScaleRaw = useTransform(manifestoProgress, [0.1, 0.5], [0.9, 1]);
  const manifestoTextScale = useSpring(manifestoTextScaleRaw, { stiffness: 120, damping: 26, mass: 0.4 });
  const manifestoTextOpacity = useTransform(manifestoProgress, [0.08, 0.46], [0.4, 1]);
  // A slow focus vignette that deepens as the panel reaches centre, then eases off — the "everything
  // else falls away, settle here" feeling. Peaks mid-travel so the moment lands when it's centred.
  const manifestoFocus = useTransform(manifestoProgress, [0, 0.5, 1], [0, 0.7, 0]);

  // ── 3D stage: the device turns in space, floating UI "pops out" toward the viewer ──────────────
  // Pointer tilt (desktop) rotates the whole assembly toward the cursor for a realistic parallax; the
  // device also turns a little as it travels; and three UI cards float at different depths (z) and
  // parallax speeds so they read as lifting OUT of the screen. All disabled under reduced-motion.
  const tiltXRaw = useMotionValue(0);
  const tiltYRaw = useMotionValue(0);
  const tiltRotX = useSpring(tiltXRaw, { stiffness: 150, damping: 18, mass: 0.4 });
  const tiltRotY = useSpring(tiltYRaw, { stiffness: 150, damping: 18, mass: 0.4 });
  const handlePhoneTilt = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    tiltYRaw.set(((e.clientX - r.left) / r.width - 0.5) * 16);
    tiltXRaw.set(-((e.clientY - r.top) / r.height - 0.5) * 12);
  };
  const resetPhoneTilt = () => {
    tiltXRaw.set(0);
    tiltYRaw.set(0);
  };
  // "It's a match" pop-out: starts lower in the panel and ends lower (never rising above the phone's
  // upper edge), so it no longer travels too far up as the section scrolls into view.
  const popNearY = useSpring(useTransform(manifestoProgress, [0, 1], [110, 0]), { stiffness: 70, damping: 20 });
  const popFarY = useSpring(useTransform(manifestoProgress, [0, 1], [-60, 90]), { stiffness: 70, damping: 20 });
  const popMidY = useSpring(useTransform(manifestoProgress, [0, 1], [40, -55]), { stiffness: 70, damping: 20 });

  // "Get the app" section: converge the text + phone toward each other as the
  // section reaches the viewport center, and let them spread back out as it
  // scrolls away (toward the top or bottom). Driven by a scroll listener so it
  // works reliably regardless of scroll-container quirks.
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const convoRef = useRef<HTMLElement>(null);

  const [strokeCoords, setStrokeCoords] = useState<{
    startY: number;
    endY: number;
    endX: number;
    winW: number;
  } | null>(null);

  useEffect(() => {
    const updateStroke = () => {
      const convo = convoRef.current;
      const mascot = document.getElementById('mascot-core'); // Targets the 260x260 container
      const container = pageContainerRef.current;
      const features = document.getElementById('features');
      if (!convo || !mascot || !container || !features) return;

      const containerRect = container.getBoundingClientRect();
      const convoRect = convo.getBoundingClientRect();
      const mascotRect = mascot.getBoundingClientRect();
      const featuresRect = features.getBoundingClientRect();

      // Ensure the mascot is actually visible (it's hidden on mobile)
      if (mascotRect.width === 0) {
        setStrokeCoords(null);
        return;
      }

      setStrokeCoords({
        startY: convoRect.top - containerRect.top + convoRect.height * 0.2,
        endY: mascotRect.top - containerRect.top + mascotRect.height * 0.11, // Tip of the mascot's pen Y
        endX: mascotRect.left - containerRect.left + mascotRect.width * 0.92, // Tip of the mascot's pen X
        winW: containerRect.width,
        midY: featuresRect.top - containerRect.top,
      });
    };

    updateStroke();

    const resizeObserver = new ResizeObserver(() => {
      // Debounce slightly or just call directly since it's cheap (just getBoundingClientRect)
      updateStroke();
    });

    if (pageContainerRef.current) {
      resizeObserver.observe(pageContainerRef.current);
    }

    // A small delay to ensure layout is done just in case
    const to = setTimeout(updateStroke, 1000);
    window.addEventListener('resize', updateStroke);
    return () => {
      clearTimeout(to);
      window.removeEventListener('resize', updateStroke);
      resizeObserver.disconnect();
    };
  }, []);

  const getAppRef = useRef<HTMLElement>(null);
  // "Get the app": side by side (lg+) a small QR sits on the left and the copy slides out from behind
  // it toward the right when the section is reached. Below lg it's copy only plus the store badges
  // (a QR is pointless on the phone that would have to scan it), with a simple fade-up.
  const [appSideBySide, setAppSideBySide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setAppSideBySide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const appReveal = !prefersReducedMotion && appSideBySide;

  // If navigated here with a hash (e.g. /#get-app from a legal page footer),
  // scroll to that section once it's laid out.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [location.hash]);

  // Scroll-spy: highlight the nav item for whichever section the reader is in. Active = the LAST
  // section whose top has crossed ~38% of the viewport height (document order:
  // philosophy -> how-it-works -> Mr.OneHook -> get-app). Above the first section nothing highlights.
  useEffect(() => {
    const ids = ['philosophy', 'features', 'under-the-hood', 'get-app'];
    let raf = 0;
    const compute = () => {
      // A nav click owns the highlight until its smooth scroll settles, so the underline goes straight
      // to the clicked item instead of sweeping through every section on the way.
      if (Date.now() < navLockUntilRef.current) return;
      const line = window.innerHeight * 0.38;
      let current = '';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // At the very bottom the last section may never reach the line; if it's on screen, it wins.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const last = document.getElementById(ids[ids.length - 1]);
      if (atBottom && last && last.getBoundingClientRect().top < window.innerHeight) current = ids[ids.length - 1];
      setActiveSection((prev) => (prev === current ? prev : current));
    };
    // A click lock ends once the smooth scroll has actually stopped (no scroll for 180ms) — browsers'
    // smooth-scroll durations differ (Safari's is longer than Chrome's) — or at the latest when it expires.
    let idle = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
      if (navLockUntilRef.current) {
        window.clearTimeout(idle);
        idle = window.setTimeout(() => {
          navLockUntilRef.current = 0;
          compute();
        }, 180);
      }
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
    };
  }, []);

  const [activeSection, setActiveSection] = useState<string>('');
  /** Until this time (ms) the scroll-spy leaves the highlight alone — set by a nav click. */
  const navLockUntilRef = useRef(0);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Desktop nav: keep the four in-page section links inline while they fit; once the nav would
  // overflow, fold them into an "Explore" dropdown. Measured, so it reacts to the real available width.
  const [exploreOpen, setExploreOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement>(null);
  // Explore opens and closes on click only; a click anywhere outside it, or Escape, closes it.
  useEffect(() => {
    if (!exploreOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (exploreRef.current && !exploreRef.current.contains(e.target as Node)) setExploreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExploreOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [exploreOpen]);
  // 0: everything inline · 1: the four section links folded into Explore · 2: everything in Explore
  const [navLevel, setNavLevel] = useState<0 | 1 | 2>(0);
  const navRowRef = useRef<HTMLDivElement>(null);
  const navLinksRef = useRef<HTMLDivElement>(null);
  const measureFullRef = useRef<HTMLDivElement>(null);
  const measureSectionsRef = useRef<HTMLDivElement>(null);
  // Auto-advancing "spotlight" couple in the stories accordion; pauses while the visitor interacts.
  const [spotlight, setSpotlight] = useState(0);
  const [storyPaused, setStoryPaused] = useState(false);
  /** Where a touch on the couple stories began, to recognise a horizontal swipe on phones. */
  const storySwipeRef = useRef<{ x: number; y: number } | null>(null);
  // width of the hero headline's "Zero distractions." line — caps the hero buttons
  const [heroLineW, setHeroLineW] = useState<number>();
  // Hero redeem button: "Redeem your invite" when it fits with breathing room, otherwise the
  // shorter "Redeem invite". Measured from a hidden copy of the full label, so it never oscillates.
  const heroRedeemRef = useRef<HTMLButtonElement>(null);
  const heroRedeemMeasureRef = useRef<HTMLSpanElement>(null);
  const [heroRedeemShort, setHeroRedeemShort] = useState(false);
  useLayoutEffect(() => {
    const btn = heroRedeemRef.current;
    const full = heroRedeemMeasureRef.current;
    if (!btn || !full) return;
    const check = () => {
      const cs = getComputedStyle(btn);
      const inner = btn.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // keep at least ~12px of margin on each side of the label
      setHeroRedeemShort(full.scrollWidth + 24 > inner);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(btn);
    document.fonts?.ready.then(check).catch(() => undefined);
    return () => ro.disconnect();
  }, []);

  // Mascot explainer video shown inside the "Under the hood" section.
  const [showMascotVideo, setShowMascotVideo] = useState(false);
  const mascotVideoRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);

  // Escape closes the video player and returns to the section content.
  useEffect(() => {
    if (!showMascotVideo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMascotVideo(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showMascotVideo]);

  // Clicking anywhere outside the player (and outside the mascot itself) closes
  // the video and brings the previous content back, returning the mascot to its
  // default state. Clicks inside the YouTube iframe stay in the iframe document,
  // so they never reach this listener.
  useEffect(() => {
    if (!showMascotVideo) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (mascotVideoRef.current?.contains(target)) return;
      if (mascotRef.current?.contains(target)) return;
      setShowMascotVideo(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [showMascotVideo]);


  type RelationshipMode = 'single' | 'taken';
  const [relationshipMode, setRelationshipMode] = useState<RelationshipMode>('single');

  const allHowItWorksSteps = useMemo(
    () => [
      {
        id: '01',
        // Discovery is only relevant to singles.
        modes: ['single'] as RelationshipMode[],
        label: 'Discover with Intent',
        eyebrow: 'Curated Discovery',
        image: discoverProfilesImage,
        alt: 'Discover profiles',
        accent: 'bg-accent/10',
        summary:
          'A small, deliberate set of people who already align with your values. No infinite feed. No fatigue. Just a considered moment of attention.',
        bullets: ['Verified profiles only', 'Distance-aware matching', 'Shared values & interests'],
      },
      {
        id: '02',
        // Connecting applies whether you're single or already seeing someone.
        modes: ['single', 'taken'] as RelationshipMode[],
        label: 'Connect with Purpose',
        eyebrow: 'Real Conversation',
        image: connectWithPurposeImage,
        alt: 'Connect and match',
        accent: 'bg-accent/15',
        summary:
          'Send one message that matters and feel the weight of a real reply. Every tap is deliberate; every conversation is private by default.',
        bullets: ['End-to-end encrypted', 'Real-time delivery', 'No read-receipt games'],
      },
      {
        id: '03',
        // Single-threaded focus applies to both audiences.
        modes: ['single', 'taken'] as RelationshipMode[],
        label: 'Get Hooked, Intentionally',
        eyebrow: 'One at a Time',
        image: getHookedImage,
        alt: 'Get hooked',
        accent: 'bg-accent/20',
        summary:
          'When you both say yes, the noise disappears. Your discovery queue closes, and the only thing left is the person in front of you.',
        bullets: ['Single-threaded focus', 'One person, fully', 'Mutual commitment'],
      },
    ],
    []
  );

  // Each step declares which audiences it applies to. All three cards always stay on screen, so the
  // Single / Seeing someone switch never reflows the row: a step that doesn't apply (discovery, for
  // people already together) turns into a calm "already done" card in place.

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Video autoplay was prevented; user interaction will trigger play
        });
      }
    }
  }, []);

  // Auto-advance the spotlight couple one by one; pause while the visitor is interacting.
  useEffect(() => {
    if (storyPaused) return;
    const id = window.setInterval(() => {
      setSpotlight((prev) => (prev + 1) % COUPLE_STORIES.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [storyPaused]);


  // Fold the nav into Explore only when it would overlap: first the four section links, then — if it
  // still doesn't fit — everything else too. Decided from the natural widths of two hidden measuring
  // copies against the space actually available, so it reacts to the real layout (and late font loads).
  useLayoutEffect(() => {
    const box = navLinksRef.current;
    const full = measureFullRef.current;
    const sections = measureSectionsRef.current;
    if (!box || !full || !sections) return;
    const check = () => {
      const avail = box.clientWidth - 8;
      const next: 0 | 1 | 2 = full.scrollWidth <= avail ? 0 : sections.scrollWidth <= avail ? 1 : 2;
      setNavLevel((prev) => (prev === next ? prev : next));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(box);
    ro.observe(full);
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    // One highlight at a time: the clicked item takes it immediately, and the scroll-spy waits for
    // the smooth scroll to finish before taking over again.
    setActiveSection(id);
    navLockUntilRef.current = Date.now() + 3000;
    element?.scrollIntoView({ behavior: 'smooth' });
    setIsMobileNavOpen(false);
    setExploreOpen(false);
    // don't leave the clicked button focused/"pressed" once we've moved on
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  // Nav link styling with an active-section underline (scroll-spy driven).
  // The underline is a real 2px bar (::after) faded in/out, not text-decoration: WebKit/Safari can
  // fail to repaint a removed text-decoration while other properties transition, which left the
  // previous item looking underlined there.
  const deskNav = (id: string) =>
    `relative text-xs font-bold uppercase tracking-[0.2em] whitespace-nowrap transition-opacity after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-[7px] after:h-[2px] after:rounded-full after:bg-accent after:transition-opacity after:content-[''] ${
      activeSection === id
        ? 'opacity-100 after:opacity-100'
        : 'opacity-60 after:opacity-0 [@media(hover:hover)]:hover:opacity-100'
    }`;
  const mobNav = (id: string, topBorder = true) =>
    `block w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-opacity ${
      topBorder ? 'border-t border-border ' : ''
    }${
      activeSection === id
        ? 'opacity-100 underline underline-offset-4 decoration-2 decoration-accent'
        : 'opacity-70 [@media(hover:hover)]:hover:opacity-100'
    }`;

  const goRedeemInvite = () => navigate('/redeem');

  return (
    <div
      className="min-h-screen bg-white text-text overflow-hidden relative"
      ref={pageContainerRef}
    >
      <Seo {...ROUTE_SEO['/']} path="/" />
      {/* Background Paint Stroke spanning sections */}
      {strokeCoords && (
        <svg
          className="hidden lg:block absolute left-0 w-full pointer-events-none"
          style={{
            top: strokeCoords.startY - 100,
            height: strokeCoords.endY - strokeCoords.startY + 200,
            zIndex: 5,
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="pinkFade" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ff69b4" stopOpacity="1" />
              <stop offset="96%" stopColor="#ff69b4" stopOpacity="1" />
              <stop offset="100%" stopColor="#ff69b4" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            const w = strokeCoords.winW;
            const startY = strokeCoords.startY;
            const endY = strokeCoords.endY;
            const h = endY - startY;
            const ex = strokeCoords.endX;
            // Intersection Y relative to this SVG's coordinate space
            const midLocalY = strokeCoords.midY
              ? strokeCoords.midY - (startY - 100)
              : 100 + h * 0.45;

            // S-curve with twists and turns, pinned exactly at midLocalY when crossing the center
            const path = `M -50,100 C ${w * 0.8},${100 + h * 0.15} ${w * 0.9},${midLocalY - 100} ${w * 0.5},${midLocalY} C ${w * 0.1},${midLocalY + 100} ${w * 0.2},${100 + h * 0.75} ${w * 0.6},${100 + h * 0.85} C ${w * 0.9},${100 + h * 0.92} ${ex + 50},${100 + h * 0.98} ${ex},${100 + h}`;

            return (
              <g opacity="0.85">
                <path
                  d={path}
                  fill="none"
                  stroke="url(#pinkFade)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  opacity="0.6"
                  transform="translate(-12, -8)"
                />
                <path
                  d={path}
                  fill="none"
                  stroke="url(#pinkFade)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  opacity="0.8"
                  transform="translate(-6, 4)"
                />
                <path
                  d={path}
                  fill="none"
                  stroke="url(#pinkFade)"
                  strokeWidth="16"
                  strokeLinecap="round"
                  opacity="1"
                  transform="translate(0, 0)"
                />
                <path
                  d={path}
                  fill="none"
                  stroke="url(#pinkFade)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  opacity="0.7"
                  transform="translate(8, -5)"
                />
                <path
                  d={path}
                  fill="none"
                  stroke="url(#pinkFade)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  opacity="0.5"
                  transform="translate(14, 6)"
                />
              </g>
            );
          })()}
        </svg>
      )}

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
        <div ref={navRowRef} className="relative w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <BrandWordmark
            className="font-bold tracking-tighter uppercase shrink-0"
            imageClassName="h-10 w-auto sm:h-10"
            textClassName="hidden sm:inline text-2xl"
          />
          {/* Primary nav — centred between the logo and the actions (in-flow, so it can never
              overlap the side buttons) */}
          <div ref={navLinksRef} className="relative hidden md:flex min-w-0 flex-1 items-center justify-center gap-4 2xl:gap-7">
            {/* Invisible measuring copies (no handlers): their natural widths decide how much of the nav
                fits — level 0 everything inline, level 1 sections in Explore, level 2 all in Explore. */}
            <div aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex flex-col">
              <div ref={measureFullRef} className="flex w-max items-center gap-4 whitespace-nowrap 2xl:gap-7">
                <span className="inline-flex items-stretch rounded-full border">
                  <span className={`${deskNav('')} pl-5 pr-4 py-2.5`}><span className="flex flex-col items-center leading-none"><span className="text-[8px]">Dating</span>Science</span></span>
                  <span className="w-px" />
                  <span className={`${deskNav('')} pl-4 pr-5 py-2.5`}><span className="flex flex-col items-center leading-none"><span className="text-[8px]">Private</span>Messenger</span></span>
                </span>
                <span className="h-4 w-px" />
                <span className={deskNav('')}>Philosophy</span>
                <span className={deskNav('')}>How it works</span>
                <span className={deskNav('')}>Mr.OneHook</span>
                <span className={deskNav('')}>Get the app</span>
                <span className="h-4 w-px" />
                <span className={deskNav('')}>Pricing</span>
              </div>
              <div ref={measureSectionsRef} className="flex w-max items-center gap-4 whitespace-nowrap 2xl:gap-7">
                <span className="inline-flex items-stretch rounded-full border">
                  <span className={`${deskNav('')} pl-5 pr-4 py-2.5`}><span className="flex flex-col items-center leading-none"><span className="text-[8px]">Dating</span>Science</span></span>
                  <span className="w-px" />
                  <span className={`${deskNav('')} pl-4 pr-5 py-2.5`}><span className="flex flex-col items-center leading-none"><span className="text-[8px]">Private</span>Messenger</span></span>
                </span>
                <span className="h-4 w-px" />
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.2em]">Explore<ChevronDown className="h-3.5 w-3.5" /></span>
                <span className="h-4 w-px" />
                <span className={deskNav('')}>Pricing</span>
              </div>
            </div>

            {navLevel < 2 && (
              <>
                {/* the two product pages, in one polished-chrome capsule with a light sweep, so they read
                    as the things worth opening */}
                <span className="oh-chrome-pill relative inline-flex items-stretch overflow-hidden rounded-full border">
                  <span aria-hidden="true" className="oh-chrome-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/3" />
                  <Link to="/science" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'science' })}
                    className="oh-chrome-seg relative z-[1] flex items-center whitespace-nowrap pl-5 pr-4 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-[#0A0B10]"
                  >
                    <span className="flex flex-col items-center leading-none"><span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#1F3A6B]/70">Dating</span>Science</span>
                  </Link>
                  <span aria-hidden="true" className="relative z-[1] w-px bg-gradient-to-b from-transparent via-[#9AA1AB] to-transparent" />
                  <Link to="/messenger" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'messenger' })}
                    className="oh-chrome-seg relative z-[1] flex items-center whitespace-nowrap pl-4 pr-5 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-[#0A0B10]"
                  >
                    <span className="flex flex-col items-center leading-none"><span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#1F3A6B]/70">Private</span>Messenger</span>
                  </Link>
                </span>
                <span aria-hidden="true" className="h-4 w-px bg-border" />
              </>
            )}

            {navLevel === 0 ? (
              <>
                <button
                  onClick={() => scrollToSection('philosophy')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'philosophy' })}
                  className={deskNav('philosophy')}
                >
                  Philosophy
                </button>
                <button
                  onClick={() => scrollToSection('features')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'features' })}
                  className={deskNav('features')}
                >
                  How it works
                </button>
                <button
                  onClick={() => scrollToSection('under-the-hood')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'under_the_hood' })}
                  className={deskNav('under-the-hood')}
                >
                  Mr.OneHook
                </button>
                <button
                  onClick={() => scrollToSection('get-app')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'get_app' })}
                  className={deskNav('get-app')}
                >
                  Get the app
                </button>
              </>
            ) : (
              <div ref={exploreRef} className="relative">
                <button
                  onClick={() => setExploreOpen((v) => !v)}
                  {...trackProps(UiElement.LANDING_MOBILE_MENU_TOGGLE, { value: exploreOpen ? 'closed' : 'open' })}
                  aria-expanded={exploreOpen}
                  className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap"
                >
                  Explore
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${exploreOpen ? 'rotate-180' : ''}`} />
                </button>
                {exploreOpen && (
                  <div className="absolute left-1/2 top-full z-50 w-52 -translate-x-1/2 pt-3">
                    <div className="border border-border bg-white shadow-lg">
                      {navLevel === 2 && (
                        <>
                          <Link to="/science" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'science' })} className={mobNav('science', false)}>
                            <span className="flex flex-col leading-none"><span className="text-[8px] font-semibold tracking-[0.2em] opacity-60">Dating</span><span className="mt-1">Science</span></span>
                          </Link>
                          <Link to="/messenger" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'messenger' })} className={mobNav('messenger')}>
                            <span className="flex flex-col leading-none"><span className="text-[8px] font-semibold tracking-[0.2em] opacity-60">Private</span><span className="mt-1">Messenger</span></span>
                          </Link>
                          <span aria-hidden="true" className="block h-[2px] bg-black/80" />
                        </>
                      )}
                      <button onClick={() => scrollToSection('philosophy')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'philosophy' })} className={mobNav('philosophy', false)}>
                        Philosophy
                      </button>
                      <button onClick={() => scrollToSection('features')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'features' })} className={mobNav('features')}>
                        How it works
                      </button>
                      <button onClick={() => scrollToSection('under-the-hood')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'under_the_hood' })} className={mobNav('under-the-hood')}>
                        Mr.OneHook
                      </button>
                      <button onClick={() => scrollToSection('get-app')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'get_app' })} className={mobNav('get-app')}>
                        Get the app
                      </button>
                      {navLevel === 2 && (
                        <>
                          <span aria-hidden="true" className="block h-[2px] bg-black/80" />
                          <Link to="/pricing" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'pricing' })} className={mobNav('pricing', false)}>
                            Pricing
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {navLevel < 2 && (
              <>
                <span aria-hidden="true" className="h-4 w-px bg-border" />
                <Link to="/pricing" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'pricing' })}
                  className="text-xs font-bold uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap"
                >
                  Pricing
                </Link>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <div className="relative md:hidden">
              <button
                onClick={() => setIsMobileNavOpen((prev) => !prev)}
                {...trackProps(UiElement.LANDING_MOBILE_MENU_TOGGLE, { value: isMobileNavOpen ? 'closed' : 'open' })}
                className="inline-flex items-center gap-1 px-3 py-2 border border-border text-[10px] font-black uppercase tracking-[0.2em]"
                aria-expanded={isMobileNavOpen}
                aria-label="Toggle navigation menu"
              >
                Explore
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${isMobileNavOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isMobileNavOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 border border-border bg-white shadow-lg">
                  {/* same order as the full desktop header */}
                  <Link to="/science" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'science' })} className={mobNav('science', false)}>
                    <span className="flex flex-col leading-none"><span className="text-[8px] font-semibold tracking-[0.2em] opacity-60">Dating</span><span className="mt-1">Science</span></span>
                  </Link>
                  <Link to="/messenger" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'messenger' })} className={mobNav('messenger')}>
                    <span className="flex flex-col leading-none"><span className="text-[8px] font-semibold tracking-[0.2em] opacity-60">Private</span><span className="mt-1">Messenger</span></span>
                  </Link>
                  <span aria-hidden="true" className="block h-[2px] bg-black/80" />
                  <button
                    onClick={() => scrollToSection('philosophy')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'philosophy' })}
                    className={mobNav('philosophy', false)}
                  >
                    Philosophy
                  </button>
                  <button
                    onClick={() => scrollToSection('features')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'features' })}
                    className={mobNav('features')}
                  >
                    How it works
                  </button>
                  <button
                    onClick={() => scrollToSection('under-the-hood')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'under_the_hood' })}
                    className={mobNav('under-the-hood')}
                  >
                    Mr.OneHook
                  </button>
                  <button
                    onClick={() => scrollToSection('get-app')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'get_app' })}
                    className={mobNav('get-app')}
                  >
                    Get the app
                  </button>
                  <span aria-hidden="true" className="block h-[2px] bg-black/80" />
                  <Link to="/pricing" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'pricing' })} className={mobNav('pricing', false)}>
                    Pricing
                  </Link>
                </div>
              )}
            </div>

            {/* Account button next to the actions — same accent style as Logout/Redeem */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => navigate(isAuthenticated ? '/app' : '/login')}
                {...trackProps(UiElement.LANDING_LOGIN)}
                className="px-4 sm:px-6 py-2 bg-accent text-white text-[10px] sm:text-xs font-bold uppercase tracking-[0.22em] sm:tracking-[0.3em] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                {isAuthenticated ? 'Dashboard' : 'Sign in'}
              </button>
            </div>

            <button
              onClick={() => navigate(isAuthenticated ? '/app' : '/login')}
              {...trackProps(UiElement.LANDING_LOGIN)}
              className="md:hidden px-4 sm:px-6 py-2 bg-accent text-white text-[10px] sm:text-xs font-bold uppercase tracking-[0.22em] sm:tracking-[0.3em] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Dashboard' : 'Sign in'}
            </button>

            {isAuthenticated ? (
              <button
                onClick={handleLogout} {...trackProps(UiElement.SETTINGS_SIGN_OUT)}
                className="px-4 sm:px-6 py-2 bg-accent text-white text-[10px] sm:text-xs font-bold uppercase tracking-[0.22em] sm:tracking-[0.3em] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={goRedeemInvite} {...trackProps(UiElement.LANDING_GET_STARTED)}
                className="px-4 sm:px-6 py-2 bg-accent text-white text-[10px] sm:text-xs font-bold uppercase tracking-[0.22em] sm:tracking-[0.3em] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Redeem Invite</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section {...hideMrOneHook} className="min-h-[calc(100lvh-72px)] flex flex-col items-center justify-start md:justify-center px-6 mt-[72px] pt-0 pb-[calc(100lvh-100svh)] relative bg-black overflow-hidden z-40">
        {/* Mobile: a full-width video rectangle pinned to the top (sides preserved) that fades
            into black. Desktop (md+): full-cover background as before. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={heroVideoPoster}
          crossOrigin="anonymous"
          className="absolute inset-x-0 top-0 z-0 h-[44vh] w-full object-cover object-top md:inset-0 md:h-full md:translate-x-[22%] md:[mask-image:linear-gradient(to_right,transparent_0%,black_22%)] md:[-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_22%)]"
        >
          <source src={heroVideoSource} type="video/mp4" />
        </video>

        {/* Mobile: fade the bottom of the video rectangle into solid black so the text below sits
            on pure black for maximum legibility. */}
        <div className="absolute inset-x-0 top-0 z-[1] h-[44vh] bg-gradient-to-b from-black/25 via-black/5 to-black md:hidden" />

        {/* Desktop/landscape: the video is nudged right (right edge cropped); fade from black on the
            LEFT into the video so the left-sitting hero text stays legible. */}
        {/* The black reaches in along a curve, not a straight vertical line: narrow at the top, as wide
            as before at the bottom (an ellipse anchored at the bottom-left corner), so the video
            meets the black on a soft arc. */}
        <div
          className="absolute inset-0 z-[1] hidden md:block"
          style={{
            background:
              'radial-gradient(ellipse 95% 190% at 0% 100%, #000 0%, #000 36%, rgba(0,0,0,0.82) 50%, rgba(0,0,0,0.45) 64%, transparent 84%)',
          }}
        />

        {/* Desktop: one faint, static navy glow behind the headline, so the black has depth and the
            words read as lit. Same navy as the glow behind the story cards below, which ties the two
            sections together. No shapes or texture: it should be felt, not noticed. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] hidden md:block"
          style={{ background: 'radial-gradient(38% 48% at 31% 50%, rgba(31,58,107,0.32) 0%, rgba(31,58,107,0.1) 50%, transparent 80%)' }}
        />

        {/* Desktop: the video dissolves into black along the bottom too, so the hero hands over to the
            black "Every hook starts with a sentence" section without a hard edge under the video. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] hidden h-56 bg-gradient-to-b from-transparent via-black/70 to-black md:block" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-4xl relative w-full z-10 mt-[40vh] md:mt-0 md:max-w-2xl lg:max-w-[52rem] md:self-start md:ml-[6%] lg:ml-[9%]"
        >
          <div className="mb-8 text-white/75">
            <Kicker className="text-white/75">
              By invitation
              <span className="w-1.5 h-1.5 rounded-full bg-status-hooked animate-pulse" />
              One at a time
            </Kicker>
          </div>

          <HeroHeadline onLine2Width={setHeroLineW} />

          <p className="relative mx-auto mb-10 max-w-2xl text-lg md:text-2xl font-light leading-relaxed text-white/85 drop-shadow-md">
            {/* Invisible sizer reserves the final space so buttons below don't
                shift while the line types out. */}
            {/* phones get the first sentence only; the encryption line shows from sm up */}
            <span className="invisible" aria-hidden="true">
              Talk to someone ready to prioritise you.
              <span className="hidden sm:inline">
                {' '}Locked end-to-end, so only the two of you can read it.
              </span>
            </span>
            <span className="absolute inset-0 sm:hidden">
              <Typewriter text="Talk to someone ready to prioritise you." />
            </span>
            <span className="absolute inset-0 hidden sm:block">
              <Typewriter text="Talk to someone ready to prioritise you. Locked end-to-end, so only the two of you can read it." />
            </span>
          </p>

          {/* Desktop: Dating Science | Redeem | Private Messenger in one row, all the same size.
              Small screens: Redeem on top, the two explore buttons below it, side by side. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            // never wider than the "Zero distractions." line above
            style={heroLineW ? { maxWidth: heroLineW } : undefined}
            className="mx-auto grid w-full max-w-[420px] grid-cols-2 gap-3 lg:flex lg:max-w-none lg:items-center lg:justify-center lg:gap-4"
          >
            <Link
              to="/science"
              {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'science' })}
              className="order-2 flex h-[52px] flex-col items-center justify-center rounded border border-white/40 px-4 text-center leading-tight text-white backdrop-blur-sm transition-colors hover:bg-white/10 lg:order-none lg:min-w-0 lg:flex-1 lg:basis-0"
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/60">Dating</span>
              <span className="text-xs font-black uppercase tracking-[0.3em]">Science</span>
            </Link>
            <button
              ref={heroRedeemRef}
              onClick={goRedeemInvite} {...trackProps(UiElement.LANDING_GET_STARTED)}
              aria-label="Redeem your invite"
              className="relative order-1 col-span-2 flex h-[52px] items-center justify-center gap-2 rounded bg-white px-8 text-xs font-black uppercase tracking-[0.3em] text-accent shadow-xl transition-opacity hover:opacity-90 whitespace-nowrap lg:order-none lg:min-w-0 lg:flex-1 lg:basis-0 lg:gap-1.5 lg:px-3 lg:tracking-[0.12em] xl:tracking-[0.18em]"
            >
              <span
                ref={heroRedeemMeasureRef}
                aria-hidden="true"
                className="pointer-events-none invisible absolute left-0 top-0 inline-flex items-center gap-2 lg:gap-1.5"
              >
                Redeem your invite <ArrowRight className="w-4 h-4 shrink-0" />
              </span>
              {heroRedeemShort ? 'Redeem invite' : 'Redeem your invite'} <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
            <Link
              to="/messenger"
              {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'messenger' })}
              className="order-3 flex h-[52px] flex-col items-center justify-center rounded border border-white/40 px-4 text-center leading-tight text-white backdrop-blur-sm transition-colors hover:bg-white/10 lg:order-none lg:min-w-0 lg:flex-1 lg:basis-0"
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/60">Private</span>
              <span className="text-xs font-black uppercase tracking-[0.3em]">Messenger</span>
            </Link>
          </motion.div>

          <p className="mt-5 text-[11px] sm:text-xs text-white/60 italic">
            Have an invite code? Redeem it in seconds. Not yet? Ask a member to bring you in.
          </p>

          <HeroBadges />

          <p className="mt-5 inline-flex items-center justify-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.28em] text-white/90">
            <span aria-hidden="true" className="text-xs sm:text-sm leading-none">
              🇮🇳
            </span>
            Made in India, for the world
          </p>
        </motion.div>
      </section>

      {/* Conversation Starter — the pattern interrupt */}
      <section
        ref={convoRef}
        {...hideMrOneHook}
        className="py-12 pb-16 px-6 text-white relative overflow-hidden z-40"
        style={{
          // Continues the hero's black without a seam, then one quiet navy glow behind the headline and
          // the stories (the couples' card tint), instead of stripes and a tiled watermark.
          background:
            'radial-gradient(60% 55% at 50% 38%, rgba(31,58,107,0.42) 0%, rgba(31,58,107,0.12) 45%, transparent 75%), linear-gradient(180deg, #000 0%, #07080C 40%, #0A0B10 100%)',
          // A gentle convex bottom edge, echoing the other chapter curves; no heavy drop shadow.
          borderBottomLeftRadius: '50% 48px',
          borderBottomRightRadius: '50% 48px',
        }}
      >
        <div className="relative mx-auto max-w-6xl">
          <div className="relative z-10 text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="mb-10 pt-4"
            >
              <h2 className={`${SECTION_TITLE} mb-4`}>
                Every hook starts with a <Accent tone="silver">sentence</Accent>.
              </h2>
              <p className={`${SECTION_LEAD} text-white/65`}>
                One honest line, sent to one person. The rest is theirs to tell.
              </p>
            </motion.div>

            {/* Auto-advancing accordion: all four couples stay visible; the spotlight expands,
                the rest contract. Hover / focus pauses the loop and spotlights a couple. */}
            <div
              onMouseEnter={() => setStoryPaused(true)}
              onMouseLeave={() => setStoryPaused(false)}
              // Phones: swipe left / right to move between couples. Only a clearly horizontal swipe
              // counts, so the page still scrolls normally (vertical panning stays the browser's).
              onTouchStart={(e) => {
                const t = e.touches[0];
                storySwipeRef.current = t ? { x: t.clientX, y: t.clientY } : null;
              }}
              onTouchEnd={(e) => {
                const start = storySwipeRef.current;
                storySwipeRef.current = null;
                const t = e.changedTouches[0];
                if (!start || !t) return;
                const dx = t.clientX - start.x;
                const dy = t.clientY - start.y;
                if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
                const n = COUPLE_STORIES.length;
                setSpotlight((prev) => (prev + (dx < 0 ? 1 : -1) + n) % n);
                setStoryPaused(true);
              }}
              data-track-exempt="gesture: horizontal swipe between couple stories; the discrete choice is also available and tracked via the dots (couple_story)."
              className="flex h-[300px] touch-pan-y gap-2 sm:h-[340px] md:h-[380px] md:gap-3"
            >
              {COUPLE_STORIES.map((s, i) => (
                <React.Fragment key={s.id}>
                  <ExpandingCouplePanel
                    story={s}
                    active={spotlight === i}
                    reduce={Boolean(prefersReducedMotion)}
                    onActivate={() => setSpotlight(i)}
                  />
                </React.Fragment>
              ))}
            </div>

            {/* progress dots + a single CTA */}
            <div className="mt-5 flex flex-col items-center gap-4">
              <div className="flex items-center gap-1" role="group" aria-label="Choose a couple">
                {COUPLE_STORIES.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Show ${s.names}`}
                    aria-pressed={spotlight === i}
                    onClick={() => {
                      setSpotlight(i);
                      setStoryPaused(true);
                    }}
                    {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'couple_story' })}
                    // a comfortable tap target around the small visible dot
                    className="grid h-6 place-items-center px-1"
                  >
                    <span
                      className="block h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: spotlight === i ? 18 : 6,
                        background: spotlight === i ? '#ff8fc7' : 'rgba(255,255,255,0.25)',
                      }}
                    />
                  </button>
                ))}
              </div>
              <button
                onClick={goRedeemInvite} {...trackProps(UiElement.LANDING_GET_STARTED)}
                className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-white/80 hover:text-white transition-colors"
              >
                Start the conversation <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section id="philosophy" className="pt-28 pb-24 lg:pb-32 px-6 bg-white relative">
        <div className="max-w-6xl mx-auto relative z-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-6"
          >
            <Kicker chapter="01" className="mb-5 text-text/50">Philosophy</Kicker>
            <h2 className={`${SECTION_TITLE} mb-6`}>
              Connection isn&rsquo;t a <Accent tone="ink">numbers</Accent> game.
            </h2>
            <p className={`${SECTION_LEAD} opacity-70`}>
              Every one of those stories began the same way: with one person, not a hundred. The
              future of dating isn&rsquo;t about more options. It&rsquo;s about intention.
            </p>
          </motion.div>

          {/* Manifesto + editorial image — full-bleed; its height follows the content (no fixed ratio), so
              there is no empty band above or below the words and the phone. */}
          <motion.div
            ref={manifestoRef}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="group relative left-1/2 my-10 w-[calc(100vw-2.5rem)] max-w-[1500px] -translate-x-1/2 overflow-hidden rounded-[2rem] isolate sm:w-[calc(100vw-4rem)]"
          >
            {/* Image as the canvas for the manifesto — slow Ken-Burns push-in, clipped by the card */}
            <motion.img
              src={focusIntentionImage}
              alt="Focus and intention"
              loading="lazy"
              decoding="async"
              style={prefersReducedMotion ? undefined : { scale: manifestoImgScale }}
              className="absolute inset-0 w-full h-full object-cover object-center grayscale group-hover:grayscale-0 transition-[filter] duration-700 ease-out will-change-transform"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/80 to-black/55" />

            {/* Focus vignette — edges darken as the panel centres, so the eye settles on the words */}
            <motion.div
              aria-hidden="true"
              style={prefersReducedMotion ? { opacity: 0.35 } : { opacity: manifestoFocus }}
              className="pointer-events-none absolute inset-0"
            >
              <div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(120% 90% at 30% 45%, transparent 30%, rgba(0,0,0,0.82) 100%)' }}
              />
            </motion.div>

            {/* Two columns: the manifesto (left) and a living phone (right) */}
            <div className="relative z-10 grid h-full items-center gap-10 px-5 py-10 sm:px-10 lg:grid-cols-2 lg:gap-8 lg:px-14 lg:py-16">
              {/* Column 1 — the words. Left-aligned and pulled toward the phone when side-by-side; when
                  the phone is dropped (narrow screens) the text is right-aligned. */}
              <div className="ml-auto max-w-xl text-right text-white">
                <p className="mb-8 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/60">
                  <span className="h-px w-8 bg-white/40" /> Less, but better
                </p>

                <motion.p
                  style={
                    prefersReducedMotion
                      ? undefined
                      : { scale: manifestoTextScale, opacity: manifestoTextOpacity, transformOrigin: 'right center' }
                  }
                  className="text-3xl font-light tracking-tight leading-[1.15] [text-wrap:balance] drop-shadow-[0_2px_30px_rgba(0,0,0,0.45)] will-change-transform md:text-5xl"
                >
                  We&rsquo;re not here to{' '}
                  <span className="text-white/50">maximize your options.</span> We&rsquo;re
                  here to make{' '}
                  <span className="underline decoration-white/40 underline-offset-8">
                    <Accent tone="silver">one</Accent> of them count.
                  </span>
                </motion.p>

                <p className="mt-8 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
                  Dating apps became casinos of human connection: endless swiping, infinite options,
                  no depth. Everyone&rsquo;s burnt out. OneHook enforces one radical constraint: a
                  single active connection at a time. When you match, you&rsquo;re locked in.
                </p>

                <p className="mt-8 text-sm text-white/55">
                  &ldquo;The secret of wisdom is knowing what to leave out.&rdquo;
                </p>
              </div>

              {/* Column 2 — the app, alive, turning in 3D with UI popping off the glass */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-15% 0px' }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                onMouseMove={prefersReducedMotion ? undefined : handlePhoneTilt}
                onMouseLeave={prefersReducedMotion ? undefined : resetPhoneTilt}
                // Sits close to the words (not centred in its half), with room on the left for the
                // "It's a match" card that hangs off the device; the photo backdrop fills the right.
                className="hidden [perspective:1400px] lg:flex lg:justify-start lg:pl-16 xl:pl-24"
              >
                <motion.div
                  style={prefersReducedMotion ? undefined : { rotateX: tiltRotX, rotateY: tiltRotY }}
                  className="relative"
                >
                  {/* Sized to the panel (~60% of its height at 3:2): 17vw tracks the full-bleed panel's width,
                      clamped so it never shrinks to a toy on small laptops or dwarfs the words on wide
                      screens. Narrower screens drop the phone entirely. */}
                  <ManifestoPhone
                    progress={manifestoProgress}
                    reduce={prefersReducedMotion}
                    className="relative isolate mx-auto w-[clamp(220px,17vw,300px)]"
                  />

                  {/* ── Pop-out UI: floats in front of the glass (desktop), lifted via scale + parallax.
                      pointer-events-none so it never intercepts taps on the device below. ── */}
                  {!prefersReducedMotion && (
                    <>
                      {/* "It's a match" — the payoff, nearest the viewer, top-left */}
                      <motion.div
                        style={{ y: popNearY, scale: 1.08 }}
                        className="pointer-events-none absolute -left-10 top-32 z-10 hidden items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.55)] ring-1 ring-black/5 lg:flex"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: OH_RED }}>
                          <Heart className="h-3.5 w-3.5 text-white" fill="currentColor" />
                        </span>
                        <div className="leading-tight">
                          <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: OH_INK }}>It’s a match</p>
                          <p className="text-[9px]" style={{ color: 'rgba(26,26,26,0.5)' }}>Say hello to Isha</p>
                        </div>
                      </motion.div>

                      {/* a lifted photo card — right side, gently tilted */}
                      <motion.div
                        style={{ y: popFarY, scale: 1.14 }}
                        className="pointer-events-none absolute -right-12 top-60 z-10 hidden rotate-[7deg] overflow-hidden rounded-2xl shadow-[0_40px_70px_-20px_rgba(0,0,0,0.6)] ring-1 ring-black/10 lg:block"
                      >
                        <img src="/media/profile-demo/profile-3.jpg" alt="" loading="lazy" decoding="async" className="h-28 w-24 object-cover" />
                      </motion.div>

                      {/* E2E assurance pill — bottom-left */}
                      <motion.div
                        style={{ y: popMidY, scale: 1.05, background: OH_INK }}
                        className="pointer-events-none absolute -left-8 bottom-24 z-10 hidden items-center gap-2 rounded-full px-3.5 py-2 text-white shadow-[0_26px_50px_-18px_rgba(0,0,0,0.6)] lg:flex"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-wide">End-to-end encrypted</span>
                      </motion.div>
                    </>
                  )}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>

          {/* What we hold to — the rules that follow from the manifesto; they close the chapter. */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mt-16 lg:mt-20"
          >
            {/* A sub-heading inside chapter 01, deliberately NOT the chapter-label style (hairlines, small
                caps), so it reads as part of Philosophy rather than the start of a new chapter. */}
            <h3 className="mb-8 text-center text-2xl font-light tracking-tight md:text-3xl">
              What we hold to
            </h3>
            <div className="overflow-hidden rounded-3xl border border-border bg-white">
              <PrincipleValues />
            </div>
          </motion.div>
        </div>

      </section>

      {/* Features Section */}
      {/* A soft brushed-silver ground (the header pill's chrome tone) rising on a curved edge, so How it
          works reads as a new chapter instead of a continuation of Philosophy's white page. The curve
          echoes the other chapter edges (the stories' convex bottom, Mr.OneHook's arched top). */}
      <section id="features" className="pt-20 pb-0 px-6 bg-[#EEF0F3] relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-12 -translate-y-full bg-[#EEF0F3] sm:h-16 lg:h-20"
          style={{ clipPath: 'ellipse(100% 100% at 50% 100%)' }}
        />
        <div className="max-w-6xl mx-auto">
          {/* An open chapter like the others: header, a plain "before" line, every step side by side
              (stacked on narrow screens), and a plain "after" line. No carousel, nothing hidden. */}
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="text-center"
            >
              <Kicker chapter="02" className="mb-5 text-text/50">How it works</Kicker>
              <h2 className={`${SECTION_TITLE} mb-6`}>
                {relationshipMode === 'single' ? (
                  <>Three steps. <Accent tone="ink">One</Accent> focus.</>
                ) : (
                  <>Two steps. <Accent tone="ink">One</Accent> person.</>
                )}
              </h2>
              <p className={`${SECTION_LEAD} opacity-70`}>
                <SwapText
                  active={relationshipMode}
                  versions={{
                    single:
                      'OneHook is designed to feel focused and intentional, never rushed. Here is how it keeps your attention on one promising connection at a time.',
                    taken:
                      'Already together? Keep OneHook as your private, encrypted messenger: the one person who matters reaches you first. No feeds, no ads, no audience.',
                  }}
                />
              </p>

              {/* Single / not-single toggle: asks for attention until the visitor picks one */}
              <RelationshipToggle mode={relationshipMode} onChange={setRelationshipMode} />
            </motion.div>

            <p className="mx-auto mt-14 max-w-2xl text-center text-base leading-relaxed text-text/55">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.4em] text-text/40">
                Before OneHook
              </span>
              <SwapText
                active={relationshipMode}
                versions={{
                  single: 'Endless swiping, a hundred half-conversations, and no one you actually remember.',
                  taken:
                    'Buried notifications, scattered chats, and nothing built for the one person who matters.',
                }}
              />
            </p>

            <ol aria-label="How OneHook works" className="mx-auto mt-12 grid max-w-xl gap-6 lg:max-w-none lg:grid-cols-3">
              {allHowItWorksSteps.map((step, index) => {
                const done = !step.modes.includes(relationshipMode);
                return (
                  <motion.li
                    key={step.id}
                    initial={{ opacity: 0, y: 28 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-5% 0px' }}
                    transition={{ duration: 0.7, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    className={`group flex flex-col overflow-hidden rounded-3xl border transition-[border-color,background-color] duration-500 ${
                      done ? 'border-dashed border-text/15 bg-[#F7F8FA]' : 'border-border bg-white'
                    }`}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-bg">
                      <img
                        src={step.image}
                        alt={step.alt}
                        loading="lazy"
                        decoding="async"
                        className={`absolute inset-0 h-full w-full object-cover object-center transition-[transform,filter,opacity] duration-700 ease-out ${
                          done ? 'opacity-40 grayscale' : 'group-hover:scale-105'
                        }`}
                      />
                      {/* "already done" stamp, faded in over the image */}
                      <div
                        aria-hidden={!done}
                        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${done ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-accent shadow-sm">
                          <Check className="h-3.5 w-3.5" /> Already found
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-6 sm:p-7">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-text/45">
                        Step {index + 1}
                        {done && <span className="text-text/35"> · Done</span>}
                      </p>
                      <h3 className={`mt-3 text-2xl font-semibold tracking-tight transition-opacity duration-500 ${done ? 'opacity-45' : ''}`}>
                        {step.label}
                      </h3>
                      {/* Steps that can be "done" (discovery, for people already together) carry an
                          equally long done version of the text and bullets in the same grid cell, so
                          the card is the same size in both modes and neither leaves empty space.
                          Steps that always apply carry only their own text. */}
                      {(() => {
                        const canBeDone = !step.modes.includes('taken');
                        const bulletList = (items: readonly string[], hidden: boolean) => (
                          <ul
                            aria-hidden={hidden}
                            className={`[grid-area:1/1] space-y-2.5 transition-opacity duration-500 ${hidden ? 'opacity-0' : ''}`}
                          >
                            {items.map((bullet) => (
                              <li key={bullet} className="flex items-center gap-3 text-sm font-medium">
                                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                                  <Check className="h-3 w-3" />
                                </span>
                                {bullet}
                              </li>
                            ))}
                          </ul>
                        );
                        return (
                          <>
                            <p className="mt-4 flex-1 text-sm leading-relaxed opacity-70">
                              {canBeDone ? (
                                <SwapText
                                  active={done ? 'done' : 'live'}
                                  versions={{
                                    live: step.summary,
                                    done: 'You\u2019ve already found your person, so there\u2019s no dating profile to create and no one to discover. Add your partner directly.',
                                  }}
                                />
                              ) : (
                                step.summary
                              )}
                            </p>
                            <div className="mt-6 grid border-t border-border/70 pt-5">
                              {bulletList(step.bullets, done)}
                              {canBeDone && bulletList(['No dating profile needed', 'Nothing to discover', 'Add your partner directly'], !done)}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </motion.li>
                );
              })}
            </ol>

            {/* Where to go next, by audience: singles to the Dating Science, couples to the Private
                Messenger. Same chrome as the header pill, so it reads as the same product family. Both
                links share one grid cell (the toggle never shifts the layout); only the active one can
                be seen, clicked or focused. */}
            <div className="mt-10 grid justify-items-center">
              {(
                [
                  { mode: 'single', to: '/science', track: 'science', kicker: 'Dating', name: 'Science', text: 'How your one match is found' },
                  { mode: 'taken', to: '/messenger', track: 'messenger', kicker: 'Private', name: 'Messenger', text: 'Built for the two of you' },
                ] as const
              ).map((link) => {
                const shown = relationshipMode === link.mode;
                return (
                  <Link
                    key={link.mode}
                    to={link.to}
                    {...trackProps(UiElement.LANDING_NAV_LINK, { value: link.track })}
                    aria-hidden={!shown}
                    tabIndex={shown ? undefined : -1}
                    className={`oh-chrome-pill oh-chrome-seg relative inline-flex items-center gap-3 overflow-hidden rounded-full border py-2.5 pl-5 pr-4 text-[#0A0B10] transition-opacity duration-300 [grid-area:1/1] sm:gap-4 ${
                      shown ? 'opacity-100' : 'pointer-events-none opacity-0'
                    }`}
                  >
                    <span aria-hidden="true" className="oh-chrome-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/3" />
                    <span className="relative flex flex-col items-center leading-none">
                      <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#1F3A6B]/70">{link.kicker}</span>
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">{link.name}</span>
                    </span>
                    <span aria-hidden="true" className="relative h-6 w-px bg-gradient-to-b from-transparent via-[#9AA1AB] to-transparent" />
                    <span className="relative text-left text-sm sm:whitespace-nowrap">{link.text}</span>
                    <ArrowRight className="relative h-4 w-4 shrink-0" />
                  </Link>
                );
              })}
            </div>

            <p className="mx-auto mt-12 max-w-2xl text-center text-base leading-relaxed text-text/55">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.4em] text-text/40">
                After OneHook
              </span>
              One person, real conversations, and the quiet confidence of undivided attention. And no
              one peeking at your chats to lure advertisers.
            </p>
          </div>

          {/* Matching intelligence — the science behind a single good match */}
          <div
            ref={underTheHoodRef}
            id="under-the-hood"
            className="scroll-mt-24 lg:scroll-mt-28 relative mt-32 sm:mt-36 lg:mt-44 bg-accent text-white overflow-visible w-screen -ml-[50vw] left-[50%] z-10"
          >
            {/* Parabolic curve top */}
            <div
              className="absolute top-0 left-0 right-0 h-12 sm:h-16 lg:h-20 bg-accent -translate-y-full z-0"
              style={{
                clipPath: 'ellipse(100% 100% at 50% 100%)',
              }}
            />

            {/* The science page's orbit animation, blurred, centred under the pointer; it sharpens and
                settles on "Explore the science" while that button is hovered or focused. */}
            {/* It spans the curved top cap and the bottom fade strip as well: --cap / --fade mirror their
                heights, and the mask follows the cap's ellipse and the strip's fade-out. */}
            {enableOrbitBackdrop && (
            <ScienceOrbitBackdrop
              revealed={scienceRevealed}
              pointerTarget={underTheHoodRef}
              anchor={exploreScienceRef}
              className="z-[1] [--cap:3rem] [--fade:100px] sm:[--cap:4rem] sm:[--fade:150px] lg:[--cap:5rem] lg:[--fade:200px]"
              style={{
                top: 'calc(-1 * var(--cap))',
                bottom: 'calc(-1 * var(--fade))',
                maskImage: UNDER_THE_HOOD_MASK,
                WebkitMaskImage: UNDER_THE_HOOD_MASK,
                maskSize: UNDER_THE_HOOD_MASK_SIZE,
                WebkitMaskSize: UNDER_THE_HOOD_MASK_SIZE,
                maskPosition: UNDER_THE_HOOD_MASK_POSITION,
                WebkitMaskPosition: UNDER_THE_HOOD_MASK_POSITION,
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
              }}
            />
            )}

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10% 0px' }}
              transition={{ duration: 0.7 }}
              className="relative z-10"
            >
              {/* Soft radial glow accent */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-[0.12] blur-3xl"
                style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
              />

              {/* Content wrapper to maintain centered layout */}
              <div className="max-w-6xl mx-auto px-6 sm:px-12 lg:px-16">
                <section className="relative pb-16 lg:pb-20 pt-10">
                  <div className="max-w-3xl relative mx-auto text-center">
                    <Kicker chapter="03" className="mb-5 text-white/60">Mr.OneHook</Kicker>

                    <h2 className={SECTION_TITLE}>
                      The <Accent tone="silver">science</Accent> of one good match.
                    </h2>
                    <p className={`${SECTION_LEAD} mt-6 text-white/70`}>
                      Mr.OneHook does the hard work under the hood, so all you see is one person worth meeting.
                    </p>
                  </div>

                  {/* What he weighs, as six short labels: the detail lives on the science page. */}
                  <motion.ul
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {[
                      { icon: MapPin, title: 'Truly nearby' },
                      { icon: Sparkles, title: 'Read for meaning' },
                      { icon: HeartHandshake, title: 'A two-way spark' },
                      { icon: Target, title: 'Your intent, respected' },
                      { icon: Radar, title: 'A fair shot for everyone' },
                      { icon: Lock, title: 'Private by design' },
                    ].map((f) => (
                      <li
                        key={f.title}
                        className="group flex items-center gap-3 bg-accent/75 px-6 py-5 transition-colors hover:bg-white/[0.03]"
                      >
                        <f.icon className="h-4 w-4 shrink-0 text-white/60 transition-colors group-hover:text-white" />
                        <span className="text-xs font-semibold uppercase tracking-[0.18em]">{f.title}</span>
                      </li>
                    ))}
                  </motion.ul>

                  {/* Deep-dive invitation — the curious can see exactly how it works */}
                  <div className="mt-10 flex flex-col items-center text-center">
                    <button
                      type="button"
                      ref={exploreScienceRef}
                      onClick={() => navigate('/science')}
                      onMouseEnter={() => setScienceRevealed(true)}
                      onMouseLeave={() => setScienceRevealed(false)}
                      onFocus={() => setScienceRevealed(true)}
                      onBlur={() => setScienceRevealed(false)}
                      {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'science' })}
                      className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-[11px] font-black uppercase tracking-[0.24em] text-white/90 hover:bg-white hover:text-accent transition-colors"
                    >
                      Explore the science <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </section>
              </div>
            </motion.div>

            {/* Custom 1px repeated gradient fade into transparent */}
            <div
              className="absolute top-[calc(100%-1px)] left-0 w-full z-0 h-[100px] sm:h-[150px] lg:h-[200px]"
              style={{
                backgroundImage: 'url(/gradient-fade.png?v=3)',
                backgroundRepeat: 'repeat-x',
                backgroundSize: '1px 100%',
              }}
            />
          </div>
        </div>
      </section>

      {/* Mr.OneHook himself: the sign-off of chapter 03, not a chapter of its own. It starts inside
          the dark section's fade (no top padding gap, no heading), so the science and the mascot
          read as one continuous section. */}
      <section id="mascot" aria-label="Mr.OneHook" className="pt-6 sm:pt-8 lg:pt-10 pb-24 px-6 bg-[#EEF0F3] relative">
        <div className="max-w-6xl mx-auto">
          {showMascotVideo ? (
            <motion.div
              key="hood-video"
              ref={mascotVideoRef}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="relative z-50 w-full max-w-4xl mx-auto flex flex-col items-center gap-3"
            >
              {/* Close the player */}
              <button
                type="button"
                onClick={() => setShowMascotVideo(false)} {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'mascot_video' })}
                aria-label="Close video"
                title="Close video (Esc)"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-border/50 text-text/80 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-accent hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="h-4 w-4" /> Close Video
              </button>

              <div className="w-full relative overflow-hidden rounded-2xl border border-accent/15 bg-black shadow-2xl">
                <div className="aspect-video w-full">
                  <iframe
                    src={MASCOT_VIDEO_EMBED_URL}
                    title="OneHook explained"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="h-full w-full border-0"
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="hood-content"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="flex flex-col items-center justify-center max-w-4xl mx-auto"
            >
              <div
                className="relative flex flex-col items-center justify-center gap-6 mx-auto z-10 w-full"
                id="mascot-container"
              >
                {/* Message Above Mascot */}
                <div className="rounded-2xl border-2 border-accent bg-white px-6 py-4 text-center text-[11px] font-black uppercase leading-relaxed tracking-[0.14em] text-accent shadow-2xl">
                  Click to watch me explain more about onehook.club
                </div>

                {/* The Mascot */}
                <div
                  id="mascot-core"
                  className="relative w-[260px] h-[260px] flex items-center justify-center shrink-0"
                  ref={mascotRef}
                >
                  <AlienScanner
                    className="w-[260px] h-[260px] shrink-0"
                    primaryColor="#ff69b4"
                    scanColor="#0052CC"
                    onClick={() => setShowMascotVideo((open) => !open)}
                    forceExcited={true}
                    hideTooltips={true}
                  />
                </div>

                {/* Social Links Below Mascot */}
                <div className="flex w-max items-center justify-center gap-2 rounded-xl border border-accent bg-white/90 backdrop-blur-sm px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-accent shadow-lg">
                  MR.ONEHOOK'S SOCIALS:
                  <a
                    href="https://www.instagram.com/mr.onehook"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:opacity-60 transition-opacity pointer-events-auto"
                    {...trackProps(UiElement.LANDING_SOCIAL_LINK, { value: 'instagram' })}
                    aria-label="Instagram"
                  >
                    <Instagram className="w-4 h-4" />
                  </a>
                  <a
                    href="https://www.youtube.com/@mr.onehook"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:opacity-60 transition-opacity flex items-center justify-center pointer-events-auto"
                    {...trackProps(UiElement.LANDING_SOCIAL_LINK, { value: 'youtube' })}
                    aria-label="YouTube"
                  >
                    <Youtube className="w-5 h-5" />
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* Get the App — QR + store badges */}
      <section
        id="get-app"
        ref={getAppRef}
        className="py-24 px-6 bg-accent text-white relative overflow-hidden"
      >
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-white/5 blur-3xl" />

        <Kicker chapter="04" className="relative mb-12 text-white/60">Get the app</Kicker>

        {/* Copy + one QR code, centred as a pair. Side by side, the QR is a square exactly as tall as
            the copy; stacked (narrow screens), the copy sits above and the QR below. */}
        <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-12 lg:flex-row lg:justify-center lg:gap-14">
          {/* Side by side the QR is on the left and the copy on the right: the copy starts tucked behind
              the QR (shifted left, clipped from its right edge) and slides out to the right; the QR sits
              above it (z-10), so it truly emerges from behind it. Stacked: copy first, QR below.
              Remounted (key) when the layout switches so the right entrance applies. */}
          <motion.div
            key={appReveal ? 'reveal' : 'stacked'}
            // The observer sits on this unclipped wrapper: a fully clipped element never counts as
            // "in view", so the clip and slide live on the inner element below.
            initial="hidden"
            whileInView="shown"
            viewport={{ once: true, amount: 0.5 }}
            className="relative z-0 max-w-lg"
          >
            <motion.div
              variants={
                appReveal
                  ? {
                      hidden: { opacity: 0, x: '-30%', clipPath: 'inset(-20% 100% -20% -20%)' },
                      shown: { opacity: 1, x: 0, clipPath: 'inset(-20% -20% -20% -20%)' },
                    }
                  : { hidden: { opacity: 0, y: 20 }, shown: { opacity: 1, y: 0 } }
              }
              transition={appReveal ? { duration: 1.1, delay: 0.35, ease: [0.22, 1, 0.36, 1] } : { duration: 0.7 }}
              className="text-center lg:text-left"
            >
              <h2 className={`${SECTION_TITLE} mb-6`}>
                Your <Accent tone="silver">one</Accent> connection,
                <br />
                in your pocket.
              </h2>

              <p className="text-lg text-white/70 leading-relaxed mb-8 max-w-md mx-auto lg:mx-0">
                Fewer notifications, more meaning. Matches, private end-to-end encrypted chat, and
                focus mode, wherever you are.
              </p>

              <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                {APP_STORE_LINKS.ios ? (
                  <a
                    href={APP_STORE_LINKS.ios}
                    target="_blank"
                    rel="noreferrer"
                    {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
                    className={STORE_BADGE_CLASS}
                  >
                    <AppleIcon className="w-6 h-6" />
                    <span className="text-left leading-tight">
                      <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">
                        Download on the
                      </span>
                      <span className="block text-sm font-bold">App Store</span>
                    </span>
                  </a>
                ) : (
                  <span aria-disabled="true" className={STORE_BADGE_SOON_CLASS}>
                    <AppleIcon className="w-6 h-6" />
                    <span className="text-left leading-tight">
                      <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">
                        Coming soon to the
                      </span>
                      <span className="block text-sm font-bold">App Store</span>
                    </span>
                  </span>
                )}
                {APP_STORE_LINKS.android ? (
                  <a
                    href={APP_STORE_LINKS.android}
                    target="_blank"
                    rel="noreferrer"
                    {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
                    className={STORE_BADGE_CLASS}
                  >
                    <AndroidIcon className="w-6 h-6" />
                    <span className="text-left leading-tight">
                      <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">
                        Get it on
                      </span>
                      <span className="block text-sm font-bold">Google Play</span>
                    </span>
                  </a>
                ) : (
                  <span aria-disabled="true" className={STORE_BADGE_SOON_CLASS}>
                    <AndroidIcon className="w-6 h-6" />
                    <span className="text-left leading-tight">
                      <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">
                        Coming soon to
                      </span>
                      <span className="block text-sm font-bold">Google Play</span>
                    </span>
                  </span>
                )}
              </div>

              <p className="mt-6 text-xs text-white/50">
                {APP_STORE_LINKS.ios || APP_STORE_LINKS.android ? (
                  <>
                    <span className="hidden lg:inline">
                      On your phone? Point your camera at the code.
                    </span>
                    <span className="lg:hidden">Tap a badge to download.</span>
                  </>
                ) : (
                  <>
                    Already a member?{' '}
                    <Link to="/login" {...trackProps(UiElement.LANDING_LOGIN)} className="underline hover:text-white">
                      Sign in on the web
                    </Link>
                    .
                  </>
                )}
              </p>
            </motion.div>
          </motion.div>

          {/* The QR: small and quiet, a scannable code on a white tile with a caption. No scan-beam
              animation, so nothing competes with the copy. Desktop only. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative z-10 hidden shrink-0 lg:order-first lg:block"
          >
            <div className="flex w-[184px] flex-col items-center rounded-2xl bg-white p-3.5 text-accent shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
              <QRCodeSVG
                value={APP_DOWNLOAD_URL}
                size={156}
                level="H"
                marginSize={0}
                bgColor="#ffffff"
                fgColor="#1A1A1A"
                imageSettings={{ src: brandMarkImage, height: 30, width: 30, excavate: true }}
                title="QR code to download the OneHook app"
              />
              <p className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.3em] text-accent/55">
                <QrCode className="h-3 w-3" /> Scan to install
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section — on the same silver ground as everything from How it works down (only the dark
          sections and the footer differ) */}
      <section className="py-28 px-6 bg-[#EEF0F3] relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-accent/5 to-transparent" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center relative z-10"
        >
          <Kicker className="mb-8 text-text/50">
            <ShieldCheck className="w-3.5 h-3.5" /> Invite-only · Limited spots
          </Kicker>

          <h2 className={`${SECTION_TITLE} mb-8`}>
            Ready for one <Accent tone="ink">real</Accent> thing?
          </h2>

          <p className={`${SECTION_LEAD} opacity-60 mb-12 md:text-xl`}>
            Trade a thousand maybes for one real possibility. Bring an invite code and meet someone
            worth your attention.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={goRedeemInvite} {...trackProps(UiElement.LANDING_GET_STARTED)}
              className="w-full sm:w-auto h-[52px] px-10 rounded bg-accent text-white text-xs font-black uppercase tracking-[0.3em] hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-3"
            >
              Redeem your invite <ArrowRight className="w-4 h-4" />
            </motion.button>
            <button
              onClick={() => navigate('/login')} {...trackProps(UiElement.LANDING_LOGIN)}
              className="w-full sm:w-auto h-[52px] px-10 rounded border border-accent text-accent text-xs font-black uppercase tracking-[0.3em] hover:bg-accent hover:text-white transition-colors"
            >
              I have an account
            </button>
          </div>

          <p className="mt-8 text-sm opacity-40">
            OneHook is invite-only. Don&rsquo;t have a code? Ask someone you know.
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <SiteFooter />

      {/* Persistent conversion CTA — appears after the hero (shared with the science page) */}
      <StickyCta onGetApp={() => scrollToSection('get-app')} onRedeem={goRedeemInvite} />

    </div>
  );
}

/**
 * Types out `text` one character at a time on mount, with a blinking caret.
 * Respects `prefers-reduced-motion` by rendering the full text instantly. The
 * full string is exposed via aria-label so screen readers announce it once.
 */
function Typewriter({
  text,
  speed = 34,
  startDelay = 350,
}: {
  text: string;
  speed?: number;
  startDelay?: number;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setCount(text.length);
      return;
    }

    setCount(0);
    let i = 0;
    let intervalId = 0;
    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= text.length) window.clearInterval(intervalId);
      }, speed);
    }, startDelay);

    return () => {
      window.clearTimeout(startId);
      window.clearInterval(intervalId);
    };
  }, [text, speed, startDelay]);

  const done = count >= text.length;

  return (
    <span aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      <span
        aria-hidden="true"
        className={`inline-block w-[0.06em] -mb-[0.1em] h-[1em] translate-y-[0.12em] bg-current ml-0.5 ${
          done ? 'animate-pulse' : ''
        }`}
      />
    </span>
  );
}
