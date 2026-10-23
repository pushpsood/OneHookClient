import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UiElement, trackProps } from '../lib/analytics/analytics';
import { MOST_POPULAR_TIER, PAID_TIER_NAMES } from '../config/membership.config';
import { motion, AnimatePresence, useMotionValue, useSpring, useScroll, useTransform, useReducedMotion, type MotionValue } from 'motion/react';
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
  Smartphone,
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
import { AlienScanner } from './mascot';
import { hideMrOneHook } from './Chatbot/ChatbotWidget';
import { ScienceOrbitBackdrop } from './science/ScienceOrbitBackdrop';
import { useAppStore } from '../store/app-store';
import { getCognitoAuth } from '../lib/cognito-auth';

const focusIntentionImage = '/media/aerial-view-of-the-city-in-the-fog-5ZBZNUT-1600.jpg';
const discoverProfilesImage =
  '/media/man-with-backpack-walking-on-snow-covered-forest-b-JAJ77DS-1600.jpg';

/**
 * Lays out a sequence of chips/separators horizontally, but automatically
 * switches to a centered vertical stack when the horizontal layout would wrap
 * onto more than two lines. Separators flagged with `rotateWhenStacked` (e.g.
 * arrows) are rotated 90° to point downward in the vertical layout.
 *
 * Wrapping is measured on an invisible horizontal "mirror" that always reflects
 * the horizontal layout at the current width, so the decision is two‑way
 * (re‑expands to a row when there's room again).
 */
type FlowPart = { key: string; content: React.ReactNode; rotateWhenStacked?: boolean };

function AdaptiveFlow({
  parts,
  className,
  rowClass,
  colClass,
  centerHorizontal = false,
  maxLines = 2,
  overflowBehavior = 'stack',
}: {
  parts: FlowPart[];
  className?: string;
  rowClass: string;
  colClass: string;
  /** Center the horizontal (non-stacked) layout too. */
  centerHorizontal?: boolean;
  /** How many wrapped lines are allowed before the overflow behavior kicks in. */
  maxLines?: number;
  /** What to do when the horizontal layout exceeds `maxLines`. */
  overflowBehavior?: 'stack' | 'hide';
}) {
  const [overflow, setOverflow] = useState(false);
  const mirrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mirrorRef.current;
    if (!el) return;
    const measure = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      if (!kids.length) return;
      // Count wrapped lines by clustering each child's VERTICAL CENTRE.
      // Using offsetTop alone is wrong here: with `items-center`, short parts
      // (the "+" and "Final rank =" text) sit at a different offsetTop than the
      // taller pill chips, which made a single row look like several.
      const centres = kids.map((k) => k.offsetTop + k.offsetHeight / 2).sort((a, b) => a - b);
      let lines = 1;
      for (let i = 1; i < centres.length; i += 1) {
        if (centres[i] - centres[i - 1] > 6) lines += 1;
      }
      setOverflow(lines > maxLines);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [parts, maxLines]);

  const renderParts = (isStacked: boolean) =>
    parts.map((p) => (
      <span
        key={p.key}
        className={`inline-flex items-center${isStacked && p.rotateWhenStacked ? ' rotate-90' : ''}`}
      >
        {p.content}
      </span>
    ));

  const stacked = overflow && overflowBehavior === 'stack';
  const hidden = overflow && overflowBehavior === 'hide';

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Invisible horizontal mirror used only to count wrapped rows. */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className={`${rowClass} invisible pointer-events-none absolute left-0 top-0 -z-10 w-full overflow-hidden`}
      >
        {renderParts(false)}
      </div>

      {!hidden && (
        <div
          className={stacked ? colClass : `${rowClass}${centerHorizontal ? ' justify-center' : ''}`}
        >
          {renderParts(stacked)}
        </div>
      )}
    </div>
  );
}
const connectWithPurposeImage = '/media/man-playing-guitar-close-up-1600.jpg';
const getHookedImage =
  '/media/photodune-33277756-pleased-redhead-woman-student-watches-training-webinar-1600.jpg';
const heroVideoSource =
  '/media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc-1280.mp4';
const heroVideoPoster =
  '/media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc-poster.jpg';
const brandMarkImage = '/media/onehook-512.png';

/**
 * Placeholder deep link for the mobile app. Swap this for the real smart-link
 * (a single URL that routes to the App Store / Google Play by platform) once
 * the apps are published — the QR code and store badges both read from here.
 */
const APP_DOWNLOAD_URL = 'https://app.onehook.club';

/**
 * Mascot explainer video. Shown inside the "Under the hood" section when the
 * visitor clicks the mascot. Uses youtube-nocookie (no tracking cookies until
 * playback) which fits the product's privacy stance.
 */
const MASCOT_VIDEO_ID = 'Vphot1Wxvx8';
const MASCOT_VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${MASCOT_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&cc_load_policy=0`;

/** Repeating text tile used as the conversation-starter background watermark.
 *  A tiled SVG guarantees full (corner-to-corner) coverage at any rotation. */
const WATERMARK_BG = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='40'><text x='0' y='15' font-family='Inter,ui-sans-serif,sans-serif' font-size='15' font-weight='900' letter-spacing='4' fill='#ffffff'>ONE LINE CHANGED EVERYTHING</text></svg>"
)}")`;

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
function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`flex items-center justify-center gap-3 text-[10px] font-semibold uppercase tracking-[0.4em] ${className}`}
    >
      <span aria-hidden="true" className="h-px w-8 bg-current opacity-40" />
      <span className="inline-flex items-center gap-2">{children}</span>
      <span aria-hidden="true" className="h-px w-8 bg-current opacity-40" />
    </p>
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
 * couple. Within each row, one couple is still on OneHook and one has moved on together — so every
 * card always shows its current status WITHOUT hovering; hovering/focusing reveals the fuller story.
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
      'One honest question about chai became a three-hour call the same night. Two years on they still argue about the perfect cutting chai — still here, still talking.',
  },
  {
    id: 'noah-priya',
    origin: 'met',
    presence: 'off',
    opener: 'If we skipped the small talk, what should I actually ask you?',
    names: 'Noah & Priya',
    location: 'Faridabad',
    story:
      'One match was all it took. Three months in, they deleted the app together — the happiest reason to leave.',
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
      'Already together when they joined, they made OneHook their own private, encrypted corner — now the openers are their weekly date-night game. Loser picks dinner.',
  },
  {
    id: 'meera-kabir',
    origin: 'couple',
    presence: 'on',
    opener: "What's a small thing that made you feel alive this week?",
    names: 'Meera & Kabir',
    location: 'Noida',
    story:
      'They joined already together and kept OneHook as their private messenger — midnight openers, two jobs and one move later, they still trade them, and still answer honestly.',
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
 * Anonymous couple illustration — two faceless silhouettes sharing a heart, with a small lock
 * badge. It depicts a real couple whose privacy is protected while their story is shared, so it
 * stands in for a photo without exposing anyone. Palette + mirroring vary by id so each couple
 * looks different.
 */
function CoupleIllustration({ id }: { id: string }) {
  const seed = Array.from(id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const { back, glow } = ART_PALETTES[seed % ART_PALETTES.length];
  const flip = seed % 2 === 1;
  const gid = `art-${id}`;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 320"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient id={`${gid}-bg`} cx="30%" cy="16%" r="130%">
          <stop offset="0%" stopColor={glow} />
          <stop offset="58%" stopColor="#111C33" />
          <stop offset="100%" stopColor="#0A0B10" />
        </radialGradient>
        {/* brushed silver */}
        <linearGradient id={`${gid}-p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#E6E9EE" />
          <stop offset="100%" stopColor="#9AA1AB" />
        </linearGradient>
      </defs>
      <rect width="200" height="320" fill={`url(#${gid}-bg)`} />
      <g transform={flip ? 'translate(200,0) scale(-1,1)' : undefined}>
        {/* partner behind */}
        <g fill={back} opacity="0.55">
          <circle cx="74" cy="122" r="30" />
          <rect x="30" y="158" width="88" height="170" rx="44" />
        </g>
        {/* partner in front */}
        <g fill={`url(#${gid}-p)`}>
          <circle cx="124" cy="136" r="34" />
          <rect x="78" y="174" width="96" height="154" rx="48" />
        </g>
      </g>
      {/* heart above the pair */}
      <path
        transform="translate(100,54) scale(1.15)"
        d="M0 8 C-8 -5 -26 1 -14 15 L0 28 L14 15 C26 1 8 -5 0 8 Z"
        fill="#ff8fc7"
      />
      {/* privacy lock badge */}
      <g transform="translate(100,250)">
        <circle r="19" fill="#0A0B10" opacity="0.75" />
        <circle r="19" fill="none" stroke="#E6E9EE" strokeOpacity="0.6" strokeWidth="1.5" />
        <rect x="-7" y="-1" width="14" height="12" rx="2.5" fill="#E6E9EE" />
        <path d="M-4 -1 V-5 a4 4 0 0 1 8 0 V-1" fill="none" stroke="#E6E9EE" strokeWidth="2" />
      </g>
    </svg>
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
      className="group relative h-full min-w-0 basis-0 overflow-hidden rounded-[1.5rem] border border-[#E6E9EE]/15 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ff8fc7]"
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
              <p className="line-clamp-2 font-serif text-sm italic leading-snug text-white md:text-base">
                &ldquo;{story.opener}&rdquo;
              </p>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-white/75 md:line-clamp-3 md:text-xs">
                {story.story}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-serif text-sm italic text-white md:text-base">{story.names}</span>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-white/55">
                  <MapPin className="h-2.5 w-2.5 shrink-0" /> {story.location}
                </span>
              </div>
            </motion.div>
          ) : (
            <div className="min-w-0">
              <span className="block truncate font-serif text-sm italic text-white">{story.names}</span>
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

/**
 * Pine-forest silhouette band above the "OneHook Principles" divider. `preserveAspectRatio="none"`
 * lets the pointed tips show (the forest ends abruptly at the ground line), with varied heights.
 * Each pine is split into a lit left face and a shadowed right face across two depth layers (hazier
 * back, richer front) for a faceted 3D look. It overlaps the pink paint-stroke freely.
 */
function ForestBackdrop({ className = '' }: { className?: string }) {
  const BASE = 540;
  const pineFaces = (x: number, w: number, h: number, tiers = 3): { left: string; right: string; trunk: string } => {
    const L: string[] = [];
    const R: string[] = [];
    const tierH = h / tiers;
    for (let i = 0; i < tiers; i++) {
      const top = BASE - h + i * tierH * 0.8;
      const halfW = (w / 2) * (1 - i / (tiers + 1));
      const bottom = top + tierH * 1.4;
      L.push(`M ${x},${top} L ${x - halfW},${bottom} L ${x},${bottom} Z`);
      R.push(`M ${x},${top} L ${x + halfW},${bottom} L ${x},${bottom} Z`);
    }
    const trunk = `M ${x - w * 0.05},${BASE} L ${x - w * 0.05},${BASE - h * 0.1} L ${x + w * 0.05},${BASE - h * 0.1} L ${x + w * 0.05},${BASE} Z`;
    return { left: L.join(' '), right: R.join(' '), trunk };
  };
  const back: [number, number, number][] = [
    [80, 66, 74], [210, 56, 52], [330, 78, 88], [470, 60, 58], [600, 72, 82],
    [740, 56, 50], [880, 80, 92], [1010, 62, 64], [1140, 68, 80],
  ];
  const front: [number, number, number][] = [
    [40, 104, 140], [150, 88, 92], [275, 116, 128], [405, 94, 76], [540, 120, 148],
    [690, 98, 100], [825, 116, 122], [965, 94, 84], [1095, 118, 136], [1180, 90, 88],
  ];
  // Three towering pines that rise high above the tree-line (past the caption). None in the
  // centre third (x 400-800).
  const tall: [number, number, number][] = [
    [150, 150, 440], [330, 166, 500], [1035, 180, 540],
  ];
  // Farthest tree-line: many tiny pines, blurred + hazed so they read as a distant ridge.
  const farthest: [number, number, number][] = [
    [30, 34, 40], [110, 30, 34], [190, 36, 46], [270, 30, 36], [350, 34, 42], [430, 30, 32],
    [510, 36, 48], [590, 30, 38], [670, 34, 44], [750, 30, 34], [830, 36, 46], [910, 30, 36],
    [990, 34, 42], [1070, 30, 34], [1150, 36, 46],
  ];
  return (
    <svg aria-hidden="true" viewBox="0 0 1200 560" preserveAspectRatio="none" className={className}>
      <defs>
        {/* Brushed-silver gradient matching the "Every hook starts with a sentence" section's Accent. */}
        <linearGradient id="forestSilver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#E6E9EE" />
          <stop offset="100%" stopColor="#9AA1AB" />
        </linearGradient>
        {/* Soft blur for distant layers (depth of field). */}
        <filter id="forestBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        {/* Atmospheric haze: a pale veil that's strongest near the horizon, fading distance away. */}
        <linearGradient id="forestHaze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="35%" stopColor="#eef1f6" stopOpacity="0" />
          <stop offset="100%" stopColor="#eef1f6" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* farthest ridge — tiny, blurred, very faint */}
      <g filter="url(#forestBlur)" opacity="0.14">
        {farthest.map(([x, w, h], i) => {
          const f = pineFaces(x, w, h, 2);
          return (
            <g key={`z-${i}`}>
              <path d={f.left} fill="url(#forestSilver)" />
              <path d={f.right} fill="#bcc3cd" />
            </g>
          );
        })}
      </g>
      {/* far layer — blurred, hazy, lighter for depth */}
      <g filter="url(#forestBlur)" opacity="0.18">
        {back.map(([x, w, h], i) => {
          const f = pineFaces(x, w, h);
          return (
            <g key={`b-${i}`}>
              <path d={f.left} fill="url(#forestSilver)" />
              <path d={f.right} fill="#aeb5c0" />
            </g>
          );
        })}
      </g>
      {/* atmospheric haze veil — pushes the two distant layers back */}
      <rect x="0" y="0" width="1200" height="560" fill="url(#forestHaze)" />
      {/* near layer — richer, stronger light/shadow contrast */}
      <g opacity="0.32">
        {front.map(([x, w, h], i) => {
          const f = pineFaces(x, w, h);
          return (
            <g key={`f-${i}`}>
              <path d={f.trunk} fill="#26303d" />
              <path d={f.left} fill="url(#forestSilver)" />
              <path d={f.right} fill="#2b3647" />
            </g>
          );
        })}
      </g>
      {/* three towering pines (slender, 5 tiers) */}
      <g opacity="0.4">
        {tall.map(([x, w, h], i) => {
          const f = pineFaces(x, w, h, 5);
          return (
            <g key={`t-${i}`}>
              <path d={f.trunk} fill="#26303d" />
              <path d={f.left} fill="url(#forestSilver)" />
              <path d={f.right} fill="#1e2733" />
            </g>
          );
        })}
      </g>
      <rect x="0" y="540" width="1200" height="20" fill="#1e2733" opacity="0.28" />
    </svg>
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
function HeroHeadline() {
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

  return (
    <h1
      ref={headingRef}
      className="font-light tracking-[-0.03em] leading-[1.03] text-white mb-6 drop-shadow-lg"
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
    </h1>
  );
}

const PRINCIPLE_VALUES = [
  {
    icon: Focus,
    title: 'Intention',
    description: 'Every action is deliberate. Every match is a statement of purpose. No mindless scrolling.',
  },
  {
    icon: Lock,
    title: 'Constraint',
    description: 'Limits breed depth. One connection forces both people to actually show up and invest.',
  },
  {
    icon: Heart,
    title: 'Authenticity',
    description: 'Without a safety net of a thousand options, people finally show up as themselves.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy',
    description:
      'Your conversations are end-to-end encrypted. They stay between the two of you, not even we can read them.',
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
            className={`relative min-w-0 p-8 lg:px-10 lg:py-12 ${idx > 0 ? 'lg:border-l lg:border-border' : ''}`}
          >
            <div className="mb-6 flex items-center justify-between">
              <value.icon
                className={`h-6 w-6 text-accent transition-transform duration-500 ${active ? 'scale-110' : ''}`}
              />
              <span
                className={`font-mono text-xs transition-opacity duration-500 ${active ? 'opacity-70' : 'opacity-30'}`}
              >
                0{idx + 1}
              </span>
            </div>
            <h4 className="mb-3 text-lg font-bold uppercase tracking-[0.15em]">{value.title}</h4>
            <p
              // Reserve four lines on desktop: narrowed columns may rewrap to one more line, and the
              // row must not grow (and shove the page down) when that happens.
              className={`text-sm leading-relaxed transition-opacity duration-500 lg:min-h-[6.5em] ${active ? 'opacity-85' : 'opacity-60'}`}
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

/**
 * Frosted, refracting glass behind a block of content.
 *
 * - Everywhere: backdrop blur + saturation + a faint tint and specular rim, so whatever passes behind
 *   (the pink paint stroke) is diffused into soft colour and the content in front reads clearly.
 * - Chromium: the backdrop also goes through an SVG displacement filter, which bends the colours
 *   behind it like an uneven lens. Safari and Firefox ignore `url()` in backdrop-filter (and would
 *   drop the whole declaration), so that layer is opted into by feature check, not assumed.
 * - The glass drifts a little against scroll, so the backdrop slides through the lens and the
 *   refraction visibly shifts. The content itself stays put; reduced-motion users get static glass.
 */
function GlassPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const filterId = `oh-glass-${React.useId().replace(/:/g, '')}`;
  const [refracts, setRefracts] = useState(false);

  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
    setRefracts(Boolean(brands?.some((b) => b.brand === 'Chromium')));
  }, []);

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const drift = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [36, -36]);

  const frost = 'blur(5px) saturate(190%)';
  const backdrop = refracts ? `url(#${filterId}) ${frost}` : frost;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {refracts && (
        <svg aria-hidden="true" className="absolute h-0 w-0" focusable="false">
          <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="11" result="lens" />
            <feGaussianBlur in="lens" stdDeviation="6" result="smoothLens" />
            <feDisplacementMap in="SourceGraphic" in2="smoothLens" scale="64" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}

      <motion.div
        aria-hidden="true"
        style={{ y: drift, backdropFilter: backdrop, WebkitBackdropFilter: frost }}
        className="pointer-events-none absolute -inset-x-4 -inset-y-6 rounded-[2.25rem] border border-white/70 bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(0,0,0,0.04),0_30px_80px_-40px_rgba(17,17,17,0.25)] sm:-inset-x-8 md:-inset-x-14"
      >
        {/* Specular sheen across the top-left, like light catching curved glass. */}
        <span className="absolute inset-0 rounded-[inherit] bg-[linear-gradient(135deg,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0)_38%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.25)_100%)]" />
      </motion.div>

      <div className="relative">{children}</div>
    </div>
  );
}

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

/** The next card peeking under the active one, to hint at the single-focus Discover stack. */
const PHONE_NEXT = { name: 'Aarav', age: 29, img: '/media/profile-demo/profile-4.jpg', meta: '6 km away · Gurugram' } as const;

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
}) {
  const [tab, setTab] = useState<PhoneTab>(initialTab);
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
                        <p className="mt-1 font-serif text-[12.5px] italic" style={{ color: OH_INK }}>“{p.a}”</p>
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

                  <div className="mt-2.5 flex items-center gap-2.5 border bg-white p-2.5 opacity-70" style={{ borderColor: OH_BORDER }}>
                    <img src={PHONE_NEXT.img} alt="" loading="lazy" decoding="async" className="h-11 w-11 shrink-0 object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[14px] font-black leading-none">{PHONE_NEXT.name}, {PHONE_NEXT.age}</span>
                        <PhoneVerified className="h-3 w-3" />
                      </div>
                      <p className={`mt-1 ${label}`} style={{ color: muted }}>Next in your stack</p>
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
              <div className="absolute inset-x-0 top-[92px] bottom-[112px] flex flex-col gap-2 overflow-hidden px-3 py-2">
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
                      className={`max-w-[78%] rounded-2xl px-3 py-2 text-[11px] leading-snug ${m.me ? 'rounded-br-sm text-white' : 'rounded-bl-sm border'}`}
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
                  <img src={PHONE_PROFILE.photos[0]} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow-md" />
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-[15px] font-black" style={{ color: OH_INK }}>{PHONE_PROFILE.name}, {PHONE_PROFILE.age}</span>
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
            <button
              type="button"
              onClick={() => setTab('discover')}
              aria-label="Discover"
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'preview_discover' })}
              className="flex flex-1 cursor-pointer items-center justify-center"
            >
              <Layers className="h-[22px] w-[22px]" style={{ color: tab === 'discover' ? OH_INK : 'rgba(26,26,26,0.4)' }} strokeWidth={tab === 'discover' ? 2.4 : 2} />
            </button>
            <button
              type="button"
              onClick={() => setTab('messages')}
              aria-label="Messages"
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'preview_messages' })}
              className="flex flex-1 cursor-pointer items-center justify-center"
            >
              <MessageCircle className="h-[22px] w-[22px]" style={{ color: tab === 'messages' ? OH_INK : 'rgba(26,26,26,0.4)' }} strokeWidth={tab === 'messages' ? 2.4 : 2} />
            </button>
            <button
              type="button"
              onClick={() => setTab('profile')}
              aria-label="Profile"
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'preview_profile' })}
              className="flex flex-1 cursor-pointer items-center justify-center"
            >
              <User className="h-[22px] w-[22px]" style={{ color: tab === 'profile' ? OH_INK : 'rgba(26,26,26,0.4)' }} strokeWidth={tab === 'profile' ? 2.4 : 2} />
            </button>
          </div>
          {/* home indicator */}
          <div aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1/2 z-40 h-1 w-24 -translate-x-1/2 rounded-full" style={{ background: 'rgba(26,26,26,0.3)' }} />
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
  const stepsRailRef = useRef<HTMLDivElement>(null);
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
  // A static progress value for the Get-the-app phone, which reuses the manifesto mock but stays put
  // (reduce mode): no scroll-linked or floating animation, only user scroll + tab switching.
  const staticProgress = useMotionValue(0);
  const popFarY = useSpring(useTransform(manifestoProgress, [0, 1], [-60, 90]), { stiffness: 70, damping: 20 });
  const popMidY = useSpring(useTransform(manifestoProgress, [0, 1], [40, -55]), { stiffness: 70, damping: 20 });

  // "Get the app" section: converge the text + phone toward each other as the
  // section reaches the viewport center, and let them spread back out as it
  // scrolls away (toward the top or bottom). Driven by a scroll listener so it
  // works reliably regardless of scroll-container quirks.
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const convoRef = useRef<HTMLElement>(null);
  const [watermarkSize, setWatermarkSize] = useState(0);

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
  const appLeftX = useMotionValue(0);
  const appRightX = useMotionValue(0);
  // Spring-smooth the raw scroll values so the convergence glides instead of stepping.
  const appLeftXSpring = useSpring(appLeftX, { stiffness: 90, damping: 20, mass: 0.5 });
  const appRightXSpring = useSpring(appRightX, { stiffness: 90, damping: 20, mass: 0.5 });

  useEffect(() => {
    const el = getAppRef.current;
    if (!el) return;

    let maxConverge = 0;
    let raf = 0;
    const update = () => {
      // Below md the two columns stack into rows: no sideways drift, both stay dead centre.
      // Checked on every frame (not once at mount) so resizing into the stacked layout re-centres.
      if (window.innerWidth < 768) {
        maxConverge = 0;
        appLeftX.set(0);
        appRightX.set(0);
        return;
      }
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || 1;
      const sectionCenter = rect.top + rect.height / 2;
      const distance = Math.abs(sectionCenter - viewportH / 2);
      const maxDistance = viewportH / 2 + rect.height / 2;
      const t = Math.min(distance / maxDistance, 1); // 0 = centered, 1 = far away

      const converge = 56 * (1 - t);
      if (converge > maxConverge) {
        maxConverge = converge;
      }

      appLeftX.set(maxConverge); // text drifts toward center
      appRightX.set(-maxConverge); // phone drifts toward center
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [appLeftX, appRightX]);

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

  // Size the conversation-starter watermark to the section's DIAGONAL so the
  // rotated, tiled text always covers the whole background (no empty corners),
  // recalculating on window resize / resolution changes.
  useEffect(() => {
    const el = convoRef.current;
    if (!el) return;
    const measure = () => setWatermarkSize(Math.ceil(Math.hypot(el.offsetWidth, el.offsetHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const [activeStep, setActiveStep] = useState(0);
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
  const [showStickyCta, setShowStickyCta] = useState(false);

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

  // Sticky CTA: hide the redeem button when the "Get the app" label wraps to
  // more than one line. Measured on an invisible mirror that always renders
  // BOTH buttons, so the decision doesn't oscillate once the redeem is removed.
  const [hideStickyRedeem, setHideStickyRedeem] = useState(false);
  const ctaAppTextRef = useRef<HTMLSpanElement>(null);
  const ctaMirrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showStickyCta) return;
    const measure = () => {
      const el = ctaAppTextRef.current;
      if (!el) return;
      setHideStickyRedeem(el.getClientRects().length > 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ctaMirrorRef.current) ro.observe(ctaMirrorRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [showStickyCta]);

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

  // Each step declares which audiences it applies to. Singles get the full
  // flow; people already seeing someone use OneHook as a priority-notification
  // messenger, so they see only the steps tagged for the "taken" mode.
  const howItWorksSteps = useMemo(
    () => allHowItWorksSteps.filter((step) => step.modes.includes(relationshipMode)),
    [relationshipMode, allHowItWorksSteps]
  );

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

  // Show the persistent CTA only while scrolling DOWN (past the hero), and hide
  // it once the footer scrolls into view so it never sits over the footer.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY + 2; // small threshold to ignore jitter
      const goingUp = y < lastY - 2;
      lastY = y;

      const pastHero = y > window.innerHeight * 0.7;
      const footer = document.querySelector('footer');
      const footerVisible = footer
        ? footer.getBoundingClientRect().top < window.innerHeight
        : false;

      const chatbotOpen = !!document.querySelector('.chatbot-window');

      if (chatbotOpen || footerVisible || !pastHero) {
        setShowStickyCta(false);
      } else if (goingDown) {
        setShowStickyCta(true);
      } else if (goingUp) {
        setShowStickyCta(false);
      }
    };
    onScroll();

    const onChatbotToggle = (e: Event) => {
      onScroll();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('chatbotToggle', onChatbotToggle);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('chatbotToggle', onChatbotToggle);
    };
  }, []);

  useEffect(() => {
    const rail = stepsRailRef.current;
    if (!rail) return;

    let raf = 0;

    // Determine the active step by which card is closest to the rail's
    // horizontal center. This mirrors the visually-centered (snapped) card, so
    // the highlighted card and the progress timeline never drift apart. (A
    // viewport IntersectionObserver can't do this for a horizontal scroller —
    // every card intersects the viewport vertically at once.)
    const computeActive = () => {
      const cards = rail.querySelectorAll<HTMLElement>('[data-step-card]');
      if (!cards.length) return;

      const railRect = rail.getBoundingClientRect();
      const railCenter = railRect.left + railRect.width / 2;

      let bestIndex = 0;
      let bestDistance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const distance = Math.abs(cardCenter - railCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      setActiveStep((prev) => (prev !== bestIndex ? bestIndex : prev));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeActive);
    };

    computeActive();
    rail.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      rail.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const scrollToStep = (index: number) => {
    const rail = stepsRailRef.current;
    if (!rail || !howItWorksSteps[index]) return;
    const cards = rail.querySelectorAll('[data-step-card]');
    const card = cards.item(index) as HTMLElement | null;
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  const handleRelationshipModeChange = (mode: RelationshipMode) => {
    if (mode === relationshipMode) return;
    setRelationshipMode(mode);
    setActiveStep(0);
    // Reset the carousel to the first (visible) card for the new mode.
    stepsRailRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  };

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
      <section {...hideMrOneHook} className="min-h-screen flex flex-col items-center justify-start md:justify-center px-6 mt-[72px] pt-0 relative bg-black overflow-hidden z-40">
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
          className="absolute inset-x-0 top-0 z-0 h-[44vh] w-full object-cover object-top md:inset-0 md:h-full md:translate-x-[7%]"
        >
          <source src={heroVideoSource} type="video/mp4" />
        </video>

        {/* Mobile: fade the bottom of the video rectangle into solid black so the text below sits
            on pure black for maximum legibility. */}
        <div className="absolute inset-x-0 top-0 z-[1] h-[44vh] bg-gradient-to-b from-black/25 via-black/5 to-black md:hidden" />

        {/* Desktop/landscape: the video is nudged right (right edge cropped); fade from black on the
            LEFT into the video so the left-sitting hero text stays legible. */}
        <div className="absolute inset-0 z-[1] hidden bg-gradient-to-r from-black via-black/60 to-transparent md:block" />

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

          <HeroHeadline />

          <p className="relative mx-auto mb-10 max-w-2xl text-lg md:text-2xl font-light leading-relaxed text-white/85 drop-shadow-md">
            {/* Invisible sizer reserves the final space so buttons below don't
                shift while the line types out. */}
            <span className="invisible" aria-hidden="true">
              Talk to someone ready to prioritise you. Locked end-to-end, so only the two of you can
              read it.
            </span>
            <span className="absolute inset-0">
              <Typewriter text="Talk to someone ready to prioritise you. Locked end-to-end, so only the two of you can read it." />
            </span>
          </p>

          {/* Desktop: Dating Science | Redeem | Private Messenger in one row, all the same size.
              Small screens: Redeem on top, the two explore buttons below it, side by side. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mx-auto grid w-full max-w-[420px] grid-cols-2 gap-3 lg:flex lg:max-w-none lg:items-center lg:justify-center lg:gap-4"
          >
            <Link
              to="/science"
              {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'science' })}
              className="order-2 flex h-[52px] flex-col items-center justify-center rounded border border-white/40 px-4 text-center leading-tight text-white backdrop-blur-sm transition-colors hover:bg-white/10 lg:order-none lg:w-[252px]"
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/60">Dating</span>
              <span className="text-xs font-black uppercase tracking-[0.3em]">Science</span>
            </Link>
            <button
              onClick={goRedeemInvite} {...trackProps(UiElement.LANDING_GET_STARTED)}
              className="order-1 col-span-2 flex h-[52px] items-center justify-center gap-2 rounded bg-white px-8 text-xs font-black uppercase tracking-[0.3em] text-accent shadow-xl transition-opacity hover:opacity-90 whitespace-nowrap lg:order-none lg:w-[252px] lg:px-4 lg:tracking-[0.18em]"
            >
              Redeem your invite <ArrowRight className="w-4 h-4" />
            </button>
            <Link
              to="/messenger"
              {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'messenger' })}
              className="order-3 flex h-[52px] flex-col items-center justify-center rounded border border-white/40 px-4 text-center leading-tight text-white backdrop-blur-sm transition-colors hover:bg-white/10 lg:order-none lg:w-[252px]"
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/60">Private</span>
              <span className="text-xs font-black uppercase tracking-[0.3em]">Messenger</span>
            </Link>
          </motion.div>

          <p className="mt-5 text-[11px] sm:text-xs text-white/60 italic">
            Have an invite code? Redeem it in seconds. Not yet? Ask a member to bring you in.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-white/70">
            <span className="inline-flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" /> End-to-end encrypted
            </span>
            <span className="inline-flex items-center gap-2">
              <Focus className="w-3.5 h-3.5" /> One match at a time
            </span>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> Matched by science
            </span>
          </div>

          <p className="mt-5 inline-flex items-center justify-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.28em] text-white/90">
            <span aria-hidden="true" className="text-xs sm:text-sm leading-none">
              🇮🇳
            </span>
            Made in India, for the world
          </p>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mt-14 opacity-50 text-white"
          >
            <ChevronDown className="w-6 h-6 mx-auto" />
          </motion.div>
        </motion.div>
      </section>

      {/* Conversation Starter — the pattern interrupt */}
      <section
        ref={convoRef}
        {...hideMrOneHook}
        className="py-12 pb-16 px-6 text-white relative overflow-hidden z-40"
        style={{
          background: 'radial-gradient(120% 90% at 50% 0%, #16264A 0%, #0D1428 55%, #0A0B10 100%)',
          // Convex "parabola" bottom edge instead of a flat line, with a soft
          // black shadow cast downward onto the section below for depth.
          borderBottomLeftRadius: '50% 72px',
          borderBottomRightRadius: '50% 72px',
          boxShadow: '0 28px 44px -12px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Repeating watermark — this placeholder section will be swapped for real success stories */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 overflow-hidden"
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 opacity-[0.025] blur-[1.5px]"
            style={{
              width: watermarkSize || '150%',
              height: watermarkSize || '150%',
              backgroundImage: WATERMARK_BG,
              backgroundRepeat: 'repeat',
              backgroundSize: '640px 40px',
            }}
          />
        </div>

        {/* Silver shimmer accent — a fixed-width band pinned to the top-left
            corner. Diagonal silver lines are strongest at the left edge and
            fade out towards the right (Zomato-Gold style, in silver). */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute top-0 left-0 h-64 w-[min(55%,460px)]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(60deg, rgba(226,230,236,0.55) 0px, rgba(226,230,236,0.55) 1.5px, rgba(255,255,255,0.06) 1.5px, rgba(255,255,255,0.06) 4px, transparent 4px, transparent 14px)',
            // Fade on BOTH axes (right + bottom) so no hard edges show. The two
            // gradients are intersected, so a pixel is only visible where both
            // the horizontal and vertical fades are still opaque.
            WebkitMaskImage:
              'linear-gradient(to right, #000 0%, rgba(0,0,0,0.3) 38%, transparent 80%), linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.3) 38%, transparent 80%)',
            WebkitMaskComposite: 'source-in',
            maskImage:
              'linear-gradient(to right, #000 0%, rgba(0,0,0,0.3) 38%, transparent 80%), linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.3) 38%, transparent 80%)',
            maskComposite: 'intersect',
          }}
        />

        <div className="relative mx-auto max-w-6xl">
          <div className="relative z-10 text-center">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="mb-5 text-[11px] uppercase tracking-[1px] text-white/50"
            >
              Every hook starts with a sentence
            </motion.p>

            {/* Auto-advancing accordion: all four couples stay visible; the spotlight expands,
                the rest contract. Hover / focus pauses the loop and spotlights a couple. */}
            <div
              onMouseEnter={() => setStoryPaused(true)}
              onMouseLeave={() => setStoryPaused(false)}
              className="flex h-[300px] gap-2 sm:h-[340px] md:h-[380px] md:gap-3"
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
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {COUPLE_STORIES.map((s, i) => (
                  <span
                    key={s.id}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: spotlight === i ? 18 : 6,
                      background: spotlight === i ? '#ff8fc7' : 'rgba(255,255,255,0.25)',
                    }}
                  />
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
      <section id="philosophy" className="pt-28 pb-0 px-6 bg-white relative">
        <div className="max-w-6xl mx-auto relative z-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-6"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] opacity-40 mb-4">The philosophy</p>
            <h2 className="mb-6 text-4xl md:text-6xl font-light tracking-tight leading-[1.08]">
              Connection isn&rsquo;t a <Accent tone="ink">numbers</Accent> game.
            </h2>
            <p className="text-lg opacity-70 leading-relaxed max-w-2xl mx-auto">
              The future of dating isn&rsquo;t about more options. It&rsquo;s about intention.
            </p>
          </motion.div>

          {/* Manifesto + editorial image — full-bleed, fixed 2:3 (height:width) landscape stage */}
          <motion.div
            ref={manifestoRef}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="group relative left-1/2 my-10 w-[calc(100vw-2.5rem)] max-w-[1500px] -translate-x-1/2 overflow-hidden rounded-[2rem] isolate sm:w-[calc(100vw-4rem)] lg:aspect-[3/2]"
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
            <div className="relative z-10 grid h-full items-center gap-10 px-5 py-10 sm:px-10 lg:grid-cols-2 lg:gap-8 lg:px-14 lg:py-10">
              {/* Column 1 — the words. Left-aligned and pulled toward the phone when side-by-side; when
                  the phone is dropped (narrow screens) the text is right-aligned. */}
              <div className="ml-auto max-w-xl text-right text-white">
                <p className="mb-8 inline-flex items-center gap-3 text-[11px] uppercase tracking-[0.35em] text-white/60">
                  <span className="h-px w-8 bg-white/40" /> Less, but better
                </p>

                <motion.p
                  style={
                    prefersReducedMotion
                      ? undefined
                      : { scale: manifestoTextScale, opacity: manifestoTextOpacity, transformOrigin: 'right center' }
                  }
                  className="text-3xl font-serif leading-[1.15] [text-wrap:balance] drop-shadow-[0_2px_30px_rgba(0,0,0,0.45)] will-change-transform md:text-5xl"
                >
                  We&rsquo;re not here to{' '}
                  <span className="italic text-white/50">maximize your options.</span> We&rsquo;re
                  here to make{' '}
                  <span className="italic underline decoration-white/40 underline-offset-8">
                    one of them count.
                  </span>
                </motion.p>

                <p className="mt-8 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
                  Dating apps became casinos of human connection: endless swiping, infinite options,
                  no depth. Everyone&rsquo;s burnt out. OneHook enforces one radical constraint: a
                  single active connection at a time. When you match, you&rsquo;re locked in.
                </p>

                <p className="mt-8 text-sm italic text-white/60">
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
                className="hidden [perspective:1400px] lg:flex lg:justify-center"
              >
                <motion.div
                  style={prefersReducedMotion ? undefined : { rotateX: tiltRotX, rotateY: tiltRotY }}
                  className="relative"
                >
                  <ManifestoPhone progress={manifestoProgress} reduce={prefersReducedMotion} />

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

          {/* Old way vs OneHook way — played for a laugh, not a lawsuit. Every "old way" line is a
              generic, self-aware dating-app gripe (no brand names, no borrowed taglines); the
              disclaimer frames the whole thing as our own cheeky opinion. */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mt-20 lg:mt-28 text-center"
          >
            <p className="font-serif text-xl md:text-2xl italic text-text/70">
              Guess which side your <span className="text-accent">thumb</span> prefers&nbsp;👀
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mt-8 grid md:grid-cols-2 rounded-3xl overflow-hidden border border-border"
          >
            <div className="p-8 sm:p-10 lg:p-12 bg-white md:text-right">
              <div className="mb-8 flex items-center gap-3 md:flex-row-reverse">
                <p className="text-[11px] uppercase tracking-[0.3em] opacity-40">The old way</p>
                <span className="inline-block rotate-[-6deg] rounded-full border border-dashed border-text/25 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-text/40">
                  certified exhausting
                </span>
              </div>
              <ul className="space-y-4">
                {[
                  { text: 'Swipe till your thumb files for overtime', emoji: '🫠' },
                  { text: 'Nine chats open, zero plans made', emoji: '🥱' },
                  { text: '\u201Chey\u201D \u2192 \u201Cheyy\u201D \u2192 \u201Cheyyy\u201D \u2192 crickets', emoji: '🦗' },
                  { text: 'Pay extra to see who already likes you', emoji: '💸' },
                ].map((item) => (
                  <li
                    key={item.text}
                    className="flex items-center md:flex-row-reverse gap-3 text-lg opacity-60"
                  >
                    <span className="inline-flex w-6 h-6 rounded-full border border-border items-center justify-center shrink-0">
                      <X className="w-3 h-3" />
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="line-through decoration-1 decoration-text/30">{item.text}</span>
                      <span aria-hidden="true" className="shrink-0">{item.emoji}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-8 sm:p-10 lg:p-12 bg-accent text-white">
              <div className="mb-8 flex items-center gap-3">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">The OneHook way</p>
                <span className="inline-block rotate-[5deg] rounded-full border border-dashed border-white/40 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-white/70">
                  your new ritual
                </span>
              </div>
              <ul className="space-y-4">
                {[
                  'One person. Your thumb finally rests. 😌',
                  'Full, undivided attention 🎯',
                  'Conversations that actually go somewhere 💬',
                  'Locked end-to-end \u2014 only you two can read it 🔒',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-lg">
                    <span className="inline-flex w-6 h-6 rounded-full bg-white/15 items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          <p className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] text-black/55">
            No apps were named in the making of this comparison. Any resemblance to your last three
            is purely your own memory.
          </p>
        </div>

        {/* Principles block, with a subtle pine forest rising just above the divider (behind the
            comparison). z-[1] keeps the forest behind the content (z-10) and the pink paint-stroke
            (z-5), so it never overlaps that line. */}
        <div className="relative mt-12 lg:mt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full left-1/2 z-[1] h-[22rem] w-screen -translate-x-1/2 overflow-hidden md:h-[36rem]"
            style={{
              // Keep only the side trees: fade the forest out across the centre so it never clutters
              // behind the comparison box / disclaimer text (which are horizontally centred).
              WebkitMaskImage:
                'linear-gradient(to right, #000 0%, #000 18%, transparent 34%, transparent 66%, #000 82%, #000 100%)',
              maskImage:
                'linear-gradient(to right, #000 0%, #000 18%, transparent 34%, transparent 66%, #000 82%, #000 100%)',
            }}
          >
            <ForestBackdrop className="h-full w-full" />
          </div>

          {/* Principles — a single static line (no slider) */}
          <div
            aria-hidden="true"
            className="relative z-10 -mx-6 border-y border-border py-5 text-center select-none"
          >
            <p className="text-xs font-black uppercase tracking-[0.42em] text-text/60">
              OneHook Principles
            </p>
          </div>

          {/* Core values — full screen width (-mx-6 cancels the section padding) */}
          <div className="relative z-10 -mx-6">
            <PrincipleValues />
          </div>

          {/* Bottom line closing the principles section */}
          <div aria-hidden="true" className="relative z-10 -mx-6 border-b border-border" />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="pt-16 pb-0 px-6 bg-bg relative">
        <div className="max-w-6xl mx-auto">
          {/* One sheet of glass behind the intro, stepper and slider, so the whole section reads as a unit. */}
          <GlassPanel className="z-10 py-10 md:py-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="text-center mb-6 relative z-10"
            >
              <p className="text-[11px] uppercase tracking-[0.4em] opacity-40 mb-4">How it works</p>
              <h2 className="mb-6 text-4xl md:text-6xl font-light tracking-tight leading-[1.08]">
                {relationshipMode === 'single' ? (
                  <>Three steps. <Accent tone="ink">One</Accent> focus.</>
                ) : (
                  <>Two steps. <Accent tone="ink">One</Accent> person.</>
                )}
              </h2>
              <p className="text-lg opacity-70 leading-relaxed max-w-2xl mx-auto">
                {relationshipMode === 'single'
                  ? 'OneHook is designed to feel focused and intentional, never rushed. Follow the steps to see how it keeps your attention on one promising connection at a time.'
                  : 'Already together? Keep OneHook as your private, end-to-end encrypted messenger — the one person who matters reaches you first, with no feeds, no ads and no audience. Just the two of you.'}
              </p>

              {/* Single / not-single toggle */}
              <div
                role="tablist"
                aria-label="Choose your relationship status"
                className="inline-flex items-center mt-8 p-1 rounded-full border border-border bg-white"
              >
                {(
                  [
                    { key: 'single', label: 'Single' },
                    { key: 'taken', label: 'Seeing someone' },
                  ] as const
                ).map((option) => {
                  const isActive = relationshipMode === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => handleRelationshipModeChange(option.key)} {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'relationship_mode' })}
                      className={`px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-all ${
                        isActive
                          ? 'bg-accent text-white shadow-sm'
                          : 'text-text/50 hover:text-text/80'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Stepper: counter + progress timeline + controls */}
            <div className="mt-12 mb-2 relative z-10">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="text-xs uppercase tracking-[0.28em] opacity-50">
                  Step{' '}
                  <span className="text-accent font-black">
                    {String(activeStep + 1).padStart(2, '0')}
                  </span>{' '}
                  / {String(howItWorksSteps.length).padStart(2, '0')}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Previous step"
                    onClick={() => scrollToStep(Math.max(activeStep - 1, 0))}
                    {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'how_it_works_prev' })}
                    disabled={activeStep === 0}
                    className="w-11 h-11 rounded-full border border-border flex items-center justify-center transition-all hover:border-accent hover:bg-accent hover:text-white disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-current disabled:hover:border-border"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next step"
                    onClick={() => scrollToStep(Math.min(activeStep + 1, howItWorksSteps.length - 1))}
                    {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'how_it_works_next' })}
                    disabled={activeStep === howItWorksSteps.length - 1}
                    className="w-11 h-11 rounded-full border border-border flex items-center justify-center transition-all hover:border-accent hover:bg-accent hover:text-white disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-current disabled:hover:border-border"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Clickable labeled progress timeline */}
              <div className="relative" role="tablist" aria-label="How OneHook works steps">
                <div className="absolute left-0 right-0 top-[9px] h-px bg-border" />
                <div
                  className="absolute left-0 top-[9px] h-px bg-accent transition-all duration-500 ease-out"
                  style={{
                    width: `${(activeStep / (howItWorksSteps.length - 1)) * 100}%`,
                  }}
                />
                <div className="relative flex justify-between">
                  {howItWorksSteps.map((step, index) => {
                    const isActive = activeStep === index;
                    const isDone = index <= activeStep;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={`Step ${index + 1}: ${step.label}`}
                        onClick={() => scrollToStep(index)} {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'how_it_works_step' })}
                        className="group flex flex-col items-center gap-3 px-2 -mx-2 relative z-10"
                      >
                        <span
                          className={`w-[18px] h-[18px] rounded-full border-2 transition-all duration-300 ${
                            isActive
                              ? 'bg-accent border-accent scale-110 ring-4 ring-accent/10'
                              : isDone
                                ? 'bg-accent border-accent'
                                : 'bg-white border-border group-hover:border-accent/50'
                          }`}
                        />
                        <span
                          className={`hidden sm:block text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                            isActive ? 'text-accent' : 'text-text/40 group-hover:text-text/70'
                          }`}
                        >
                          {step.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Carousel rail */}
            <div
              ref={stepsRailRef}
              role="group"
              aria-roledescription="carousel"
              aria-label="How OneHook works"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  scrollToStep(Math.min(activeStep + 1, howItWorksSteps.length - 1));
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  scrollToStep(Math.max(activeStep - 1, 0));
                }
              }}
              data-track-exempt="gesture: arrow-key paging/scroll of the carousel rail; discrete step changes are tracked via the prev/next and dot controls (how_it_works_prev/next/step)."
              className="flex gap-6 overflow-x-auto pt-10 pb-14 px-[calc(50%-41vw)] sm:px-[calc(50%-190px)] lg:px-[calc(50%-230px)] snap-x snap-mandatory scrollbar-none rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 relative z-10"
            >
              {/* Bookend (not a step, no number) — fills the lead-in gutter; shown in both modes */}
              <div
                aria-hidden="true"
                className="flex shrink-0 self-center min-h-[336px] w-[64vw] flex-col justify-center rounded-3xl border border-dashed border-border bg-bg/50 p-6 text-center sm:w-[240px] lg:w-[280px]"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text/40">Before</p>
                <h3 className="mt-3 text-2xl font-light tracking-tight md:text-3xl">
                  Life <Accent tone="ink">before</Accent> OneHook
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-text/55">
                  {relationshipMode === 'single'
                    ? 'Endless swiping, a hundred half-conversations, and no one you actually remember.'
                    : 'No priority notifications, no end-to-end encrypted chats, no platform independence, and no AI dedicated to the one person who matters.'}
                </p>
              </div>
              {howItWorksSteps.map((step, index) => {
                const isActive = activeStep === index;
                return (
                  <motion.article
                    key={step.id}
                    data-step-card
                    data-step-index={index}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${index + 1} of ${howItWorksSteps.length}: ${step.label}`}
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, margin: '-5% 0px -5% 0px' }}
                    transition={{
                      duration: 0.8,
                      delay: index * 0.05,
                      ease: [0.21, 0.47, 0.32, 0.98],
                    }}
                    className={`group relative shrink-0 snap-center w-[82vw] sm:w-[380px] lg:w-[460px] rounded-3xl border overflow-hidden bg-white flex flex-col transition-all duration-700 ease-out ${
                      isActive
                        ? 'border-accent shadow-2xl shadow-black/10 -translate-y-2 z-10'
                        : // Dim via filter, not `opacity`: Motion's entrance animation leaves an inline
                          // `opacity: 1` on the card, which would silently override an opacity class.
                          'border-border scale-[0.97] [filter:grayscale(1)_opacity(0.45)]'
                    }`}
                  >
                    {/* Image banner */}
                    <div className="relative aspect-[16/10] overflow-hidden bg-bg">
                      <img
                        src={step.image}
                        alt={step.alt}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-transparent" />
                      <div className="absolute top-4 left-4 inline-flex items-center rounded-full bg-white/90 px-3 py-1.5 backdrop-blur-sm">
                        <span className="text-[10px] font-black uppercase tracking-[0.24em] text-accent">
                          Step {index + 1} · {step.eyebrow}
                        </span>
                      </div>
                      <div className="absolute top-4 right-4 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-mono tracking-[0.2em] text-white backdrop-blur-sm">
                        {String(index + 1).padStart(2, '0')}/
                        {String(howItWorksSteps.length).padStart(2, '0')}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-6 sm:p-7">
                      <div className="flex items-baseline gap-3">
                        <span className="text-4xl font-serif italic text-accent/15 leading-none">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">
                          {step.label}
                        </h3>
                      </div>

                      <p className="mt-4 text-sm leading-relaxed opacity-70">{step.summary}</p>

                      <ul className="mt-6 space-y-2.5 pt-5 border-t border-border/70">
                        {step.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-center gap-3 text-sm font-medium">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/10 text-accent shrink-0">
                              <Check className="w-3 h-3" />
                            </span>
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.article>
                );
              })}
              {/* Bookend (not a step, no number) — fills the lead-out gutter; shown in both modes */}
              <div
                aria-hidden="true"
                className="flex shrink-0 self-center min-h-[336px] w-[64vw] flex-col justify-center rounded-3xl border border-dashed border-border bg-bg/50 p-6 text-center sm:w-[240px] lg:w-[280px]"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text/40">After</p>
                <h3 className="mt-3 text-2xl font-light tracking-tight md:text-3xl">
                  Life <Accent tone="ink">after</Accent> OneHook
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-text/55">
                  One person, real conversations, and the quiet confidence of undivided attention. And no one peeking at your chats to lure advertisers.
                </p>
              </div>
            </div>

            {/* Swipe/keys hint */}
            <p className="text-center text-[10px] uppercase tracking-[0.28em] opacity-30 mt-2 relative z-10">
              Swipe, use the arrows, or press ← / →
            </p>
          </GlassPanel>

          {/* Matching intelligence — the science behind a single good match */}
          <div
            ref={underTheHoodRef}
            id="under-the-hood"
            className="scroll-mt-24 lg:scroll-mt-28 relative mt-20 lg:mt-28 bg-accent text-white overflow-visible w-screen -ml-[50vw] left-[50%] z-10"
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
                    <p className="text-[11px] uppercase tracking-[0.4em] text-white/50 mb-5 inline-flex items-center gap-3">
                      <Sparkles className="w-3.5 h-3.5" /> Under the hood: Mr.OneHook
                    </p>

                    <h3 className="text-3xl md:text-5xl font-light tracking-tight leading-[1.05]">
                      The <Accent tone="silver">science</Accent> of one good match.
                    </h3>
                    <p className="mt-6 text-base md:text-lg text-white/70 leading-relaxed">
                      Behind the calm experience is thoughtful matching technology. It reads
                      meaning, not just keywords, and looks for a genuine two-way spark, not
                      only whether you&rsquo;d swipe right.
                    </p>
                  </div>

                  {/* Capability grid — Always visible */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 rounded-2xl overflow-hidden"
                  >
                    {[
                      {
                        icon: MapPin,
                        title: 'Real people, truly nearby',
                        text: 'We surface people genuinely within reach, never a random, endless global feed.',
                      },
                      {
                        icon: Sparkles,
                        title: 'Read for meaning',
                        text: 'We understand the feel of your whole profile, so you’re matched on who you are, not the boxes you ticked.',
                      },
                      {
                        icon: HeartHandshake,
                        title: 'A two-way spark',
                        text: 'We look for mutual fit: people likely to click with you, not just to like you back.',
                      },
                      {
                        icon: Target,
                        title: 'Your intent, respected',
                        text: 'Serious or casual, a mismatch in what you’re each looking for never outranks a genuine one.',
                      },
                      {
                        icon: Radar,
                        title: 'A fair shot for everyone',
                        text: 'Newer and quieter profiles get real, rotating visibility, not just the same popular few.',
                      },
                      {
                        icon: Lock,
                        title: 'Private by design',
                        text: 'Your chats stay end-to-end encrypted, and your attention is never sold to advertisers.',
                      },
                    ].map((f, i) => (
                      <motion.div
                        key={f.title}
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: i * 0.05 }}
                        className="group bg-accent/75 p-6 hover:bg-white/[0.03] transition-colors"
                      >
                        <f.icon className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
                        <h4 className="mt-4 text-sm font-black uppercase tracking-[0.18em]">
                          {f.title}
                        </h4>
                        <p className="mt-2 text-[13px] leading-relaxed text-white/55">{f.text}</p>
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* The transparent one-line summary, framed so it reads as honesty, not homework */}
                  <p className="mt-14 text-center text-[10px] uppercase tracking-[0.3em] text-white/40">
                    The whole of it, in one honest line
                  </p>

                  {/* Weighted blend — the honest formula, centered; hidden entirely when it wraps to multiple lines */}
                  <AdaptiveFlow
                    className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50"
                    rowClass="flex flex-wrap items-center gap-x-2 gap-y-3"
                    colClass="flex flex-col items-center gap-y-3"
                    centerHorizontal
                    maxLines={1}
                    overflowBehavior="hide"
                    parts={[
                      { key: 'lead', content: <span className="text-white/40">Final rank =</span> },
                      {
                        key: 'reciprocity',
                        content: (
                          <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70">
                            Mutual fit
                          </span>
                        ),
                      },
                      { key: 'p1', content: <span className="text-white/30">+</span> },
                      {
                        key: 'proximity',
                        content: (
                          <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70">
                            Nearby
                          </span>
                        ),
                      },
                      { key: 'p2', content: <span className="text-white/30">+</span> },
                      {
                        key: 'desirability',
                        content: (
                          <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70">
                            Genuine interest
                          </span>
                        ),
                      },
                      {
                        key: 'trail',
                        content: (
                          <span className="text-white/30">
                            &times; freshness, matched by intent
                          </span>
                        ),
                      },
                    ]}
                  />

                  {/* Deep-dive invitation — the curious can see exactly how it works */}
                  <div className="mt-12 flex flex-col items-center gap-3 text-center">
                    <p className="text-sm text-white/60">
                      Curious how a single good match is actually found?
                    </p>
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
                    <p className="text-[11px] text-white/40">
                      A guided, interactive walkthrough. No math required.
                    </p>
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

      {/* Mascot Section */}
      <section id="mascot" className="py-24 px-6 bg-white relative">
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

        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 md:gap-16 items-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            style={{ x: appLeftXSpring }}
            className="text-center md:text-left"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 border border-white/25 rounded-full">
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-white/85">
                The OneHook app
              </span>
            </div>

            <h2 className="mb-6 text-4xl md:text-6xl font-light leading-[1.05] tracking-tight">
              Your <Accent tone="silver">one</Accent> connection,
              <br />
              in your pocket.
            </h2>

            <p className="text-lg text-white/70 leading-relaxed mb-8 max-w-md mx-auto md:mx-0">
              Fewer notifications, more meaning. Matches, private end-to-end encrypted chat, and
              focus mode, wherever you are.
            </p>

            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
              <a
                href={APP_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
                className="group inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-white/25 hover:bg-white hover:text-accent transition-colors"
              >
                <AppleIcon className="w-6 h-6" />
                <span className="text-left leading-tight">
                  <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">
                    Download on the
                  </span>
                  <span className="block text-sm font-bold">App Store</span>
                </span>
              </a>
              <a
                href={APP_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
                className="group inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-white/25 hover:bg-white hover:text-accent transition-colors"
              >
                <AndroidIcon className="w-6 h-6" />
                <span className="text-left leading-tight">
                  <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">
                    Get it on
                  </span>
                  <span className="block text-sm font-bold">Google Play</span>
                </span>
              </a>
            </div>

            <p className="mt-6 text-xs text-white/50 italic">
              <span className="hidden md:inline">
                On your phone? Point your camera at the code.
              </span>
              <span className="md:hidden">Tap a badge to download.</span>
            </p>
          </motion.div>

          {/* Product visual: floating phone mockup + overlapping QR card with scan beam */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            style={{ x: appRightXSpring }}
            className="relative flex justify-center md:justify-end"
          >
            <div className="relative">
              {/* soft glow behind phone */}
              <div className="absolute inset-0 -m-6 rounded-[3rem] bg-white/10 blur-2xl" />

              {/* The same faithful OneHook iOS mock used in the manifesto, but static here: reduce mode
                  disables the scroll-linked and entrance/floating animation. Visitors can still scroll
                  each screen and switch tabs (Discover / Messages / Profile). Sized close to the
                  previous mock so it stays proportional to the copy beside it (not the manifesto's
                  larger 23vw frame). */}
              <ManifestoPhone
                progress={staticProgress}
                reduce
                className="relative isolate mx-auto w-[240px] sm:w-[264px] lg:w-[300px]"
              />

              {/* Floating QR card — raised to sit ABOVE the phone's bottom tab bar (navbar) so it never
                  covers the Discover / Messages / Profile controls. */}
              <div className="absolute -left-6 sm:-left-16 bottom-24 w-[150px] rounded-2xl bg-white text-accent p-3 shadow-2xl border border-black/5">
                <div className="relative rounded-xl overflow-hidden border border-border p-2 flex items-center justify-center">
                  <QRCodeSVG
                    value={APP_DOWNLOAD_URL}
                    size={118}
                    level="H"
                    marginSize={0}
                    bgColor="#ffffff"
                    fgColor="#1A1A1A"
                    imageSettings={{ src: brandMarkImage, height: 24, width: 24, excavate: true }}
                  />
                  {/* animated scan beam */}
                  <motion.div
                    aria-hidden="true"
                    initial={{ y: '-120%' }}
                    animate={{ y: '120%' }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      repeatType: 'reverse',
                    }}
                    className="pointer-events-none absolute left-0 right-0 h-8 bg-gradient-to-b from-transparent via-status-hooked/50 to-transparent"
                  />
                  {/* scanner corner brackets */}
                  <span className="pointer-events-none absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-status-hooked/70" />
                  <span className="pointer-events-none absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-status-hooked/70" />
                  <span className="pointer-events-none absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-status-hooked/70" />
                  <span className="pointer-events-none absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-status-hooked/70" />
                </div>
                <p className="mt-2 w-full text-center text-[8px] font-black uppercase tracking-[0.2em] opacity-60 inline-flex items-center gap-1 justify-center">
                  <QrCode className="w-3 h-3" /> Scan to install
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-28 px-6 bg-bg relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-accent/5 to-transparent" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 border border-accent/20 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-black uppercase tracking-[0.24em] opacity-70">
              Invite-only · Limited spots
            </span>
          </div>

          <h2 className="mb-8 text-4xl md:text-6xl font-light tracking-tight">
            Ready for one <Accent tone="ink">real</Accent> thing?
          </h2>

          <p className="text-lg md:text-xl opacity-60 italic mb-12 max-w-2xl mx-auto">
            Trade a thousand maybes for one real possibility. Bring an invite code and meet someone
            worth your attention.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={goRedeemInvite} {...trackProps(UiElement.LANDING_GET_STARTED)}
              className="w-full sm:w-auto px-10 py-5 bg-accent text-white text-sm font-black uppercase tracking-[0.3em] hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-3"
            >
              Redeem your invite <ArrowRight className="w-5 h-5" />
            </motion.button>
            <button
              onClick={() => navigate('/login')} {...trackProps(UiElement.LANDING_LOGIN)}
              className="w-full sm:w-auto px-10 py-5 border border-accent text-accent text-sm font-black uppercase tracking-[0.3em] hover:bg-accent hover:text-white transition-colors"
            >
              I have an account
            </button>
          </div>

          <p className="mt-8 text-sm opacity-40 italic">
            OneHook is invite-only. Don&rsquo;t have a code? Ask someone you know.
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <SiteFooter />

      {/* Persistent conversion CTA — appears after the hero (sticky-CTA best practice) */}
      <AnimatePresence>
        {showStickyCta && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3 }}
            id="sticky-cta"
            className="fixed bottom-4 inset-x-0 mx-auto z-[70] w-[calc(100%-2rem)] sm:w-max sm:max-w-[calc(100%-2rem)]"
          >
            {/* Invisible mirror (always both buttons) — measures whether the
                "Get the app" label wraps to > 1 line at the current width. */}
            <div
              ref={ctaMirrorRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute inset-0 flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-full border border-white/10"
            >
              <span className="hidden md:block portrait:hidden whitespace-nowrap pl-4 pr-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
                One connection. Zero distractions.
              </span>
              <span className="flex-1 sm:flex-none block text-center px-4 py-2.5 sm:px-6 sm:py-3.5 border border-white/30 text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-[0.2em] rounded-full">
                <Smartphone className="inline w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 align-middle" />
                <span ref={ctaAppTextRef} className="align-middle">
                  Get the app
                </span>
              </span>
              <span className="flex-1 sm:flex-none px-4 py-2.5 sm:px-6 sm:py-3.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-[0.2em] rounded-full inline-flex items-center justify-center gap-1.5 sm:gap-2">
                <span className="hidden sm:inline">Redeem invite</span>
                <span className="sm:hidden">Redeem</span>
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 bg-accent text-white p-2 sm:p-3 rounded-full shadow-2xl border border-white/10">
              <span className="hidden md:block portrait:hidden whitespace-nowrap pl-4 pr-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
                One connection. Zero distractions.
              </span>
              <button
                onClick={() => scrollToSection('get-app')} {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'get_app' })}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-4 py-2.5 sm:px-6 sm:py-3.5 border border-white/30 text-white text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-[0.2em] rounded-full hover:bg-white/10 transition-colors"
              >
                <Smartphone className="w-3 h-3 sm:w-4 sm:h-4" /> Get the app
              </button>
              {!hideStickyRedeem && (
                <button
                  onClick={goRedeemInvite} {...trackProps(UiElement.LANDING_GET_STARTED)}
                  className="flex-1 sm:flex-none px-4 py-2.5 sm:px-6 sm:py-3.5 bg-white text-accent text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-[0.2em] rounded-full hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 sm:gap-2"
                >
                  <span className="hidden sm:inline">Redeem invite</span>
                  <span className="sm:hidden">Redeem</span>
                  <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
