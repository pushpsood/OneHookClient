import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import {
  ArrowRight,
  Check,
  EyeOff,
  FileText,
  HandHeart,
  Database,
  Fingerprint,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Mic,
  Laptop,
  Tablet,
  Plus,
  QrCode,
  ShieldCheck,
  Skull,
  Smartphone,
  Tent,
  TreePine,
  Video,
  Phone,
  SmilePlus,
  Timer,
  Reply,
  ScreenShare,
  Trash2,
  CheckCheck,
  MessageCircleMore,
} from 'lucide-react';
import { STORY_PAGE_TITLES, SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { Seo } from '../common/Seo';
import { ROUTE_SEO } from '../../config/seo-routes';
import { AlienScanner } from '../mascot';
import { ManifestoPhone } from '../Landing';
import { ProgressBar } from '../science/Science';
import {
  StoryTimelineProvider,
  bandIndex,
  isRepeatedAttempt,
  isStoryComplete,
  makeEqualBands,
  SHOW_MIN_MS,
  scrollLimit,
  storyTrackHeight,
  usePassed,
  useSceneClock,
  useSceneLine,
  useSceneProgress,
  useStoryInstant,
  useScrollLimit,
  useStoryPlayback,
  useTimeline,
} from './storyTimeline';
import { AppleIcon, GoogleIcon } from '../common/BrandIcons';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { GetAppLink } from '../common/GetAppLink';

/**
 * /messenger — one continuous, scroll-driven story on a light page.
 *
 * A single pinned stage stays on screen while you scroll; its illustration morphs from scene to
 * scene and a pink thread fills along the way, so it reads as one story rather than sections.
 * Pictures and motion do the explaining; text is a few words per scene.
 *
 * Every promise maps to a real capability: end-to-end encrypted chat, history recovery via an
 * encrypted key backup in the user's Apple/Google account + passkey, approving a new device with a
 * QR code, translated call captions, and encrypted photos/videos/voice/files. Keep it that way.
 */

// No donation provider is wired up yet, so the donate CTA opens an email to the team.
const DONATE_HREF = 'mailto:hello@onehook.club?subject=I%27d%20like%20to%20support%20OneHook%20Messenger';

const INK = '#0A0B10';
const PINK = '#ff8fc7';

/**
 * Lighter rendering for phones, tablets and low-memory devices: the same story, screens and motion,
 * but without the effects that cost the most memory on a phone GPU — animated/static blur filters,
 * frosted-glass panels, never-ending decorative loops and most of the peeking mascots. (Heavy pages
 * were getting their tab killed and reloaded by the browser on some phones.) `?lite=1` / `?lite=0`
 * forces it either way for testing.
 */
function detectLite(): boolean {
  if (typeof window === 'undefined') return false;
  const forced = new URLSearchParams(window.location.search).get('lite');
  if (forced === '1') return true;
  if (forced === '0') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 820;
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const fewCores = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
  return touch || smallScreen || lowMemory || fewCores;
}
const LiteContext = createContext(false);
const useLite = () => useContext(LiteContext);

/* ── Shared bits ───────────────────────────────────────────────────────────── */

function Accent({ children }: { children: ReactNode }) {
  return <span className="font-serif italic text-accent">{children}</span>;
}

/* ── Scenes (illustration-first) ───────────────────────────────────────────── */

/* ── Scene 2: the journey of one message ─────────────────────────────────── */

const NOISE = 'x9#Lq€7ß•Ω2∆k@Zr%8¥Jt&4ƒ§µ';

/** A string of random glyphs that re-rolls while `active`. */
function useNoise(len: number, active: boolean) {
  const reduce = useReducedMotion();
  const roll = () => Array.from({ length: len }, () => NOISE[Math.floor(Math.random() * NOISE.length)]).join('');
  const [s, setS] = useState(roll);
  useEffect(() => {
    if (!active || reduce) return;
    const id = window.setInterval(() => setS(roll()), 110);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduce, len]);
  return s;
}

/**
 * A fixed-size design canvas that scales to fill the space it is given (up to 1.3x), picking a
 * landscape or portrait composition from the available aspect ratio — so the scene uses the whole
 * screen on any device.
 */
function FitCanvas({
  land,
  port,
  portView,
  children,
}: {
  land: { w: number; h: number };
  port: { w: number; h: number };
  /** Portrait only: the part of the canvas (canvas units, vertical band) that holds this screen's
   *  content. The canvas zooms so that band fills the space — on a phone the full 1300-unit canvas
   *  would otherwise make everything tiny. Changes glide, like a camera. */
  portView?: { y: number; h: number };
  children: (layout: 'land' | 'port', width: number) => ReactNode;
}) {
  const instant = useStoryInstant();
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // phones always get the portrait composition (a short phone can make the stage wider than tall)
  const phone = typeof window !== 'undefined' && window.innerWidth < 640;
  const layout = box.h > 0 && box.w / box.h >= 1.05 && !phone ? 'land' : 'port';
  const dim = layout === 'land' ? land : port;
  const view = layout === 'port' && portView ? portView : { y: 0, h: dim.h };
  // Portrait: the canvas is as wide as the space's shape allows (never narrower than the design), and
  // the scene spreads out to it — so the side space is used instead of left empty.
  const width = layout === 'port' && box.w && box.h ? Math.round(Math.min(720, Math.max(dim.w, (box.w / box.h) * view.h))) : dim.w;
  const scale = box.w && box.h ? Math.min(box.w / width, box.h / view.h, 1.3) : 0;
  // shift so the view band's centre sits in the middle of the space
  const shiftY = (dim.h / 2 - (view.y + view.h / 2)) * scale;
  return (
    // overflow stays visible: the canvas is already scaled to fit, and clipping would cut the
    // phones' soft shadows into a hard line where the text below begins.
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-visible [&>*]:pointer-events-auto">
      {scale > 0 && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width,
            height: dim.h,
            transform: `translate(-50%, -50%) translateY(${shiftY}px) scale(${scale})`,
            transformOrigin: 'center',
            transition: instant ? 'none' : 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {children(layout, width)}
        </div>
      )}
    </div>
  );
}

type Stop = 'attackers' | 'database' | 'family';

/** One checkpoint the message passes: idle → active (it is being tried) → done (the verdict stays). */
function Checkpoint({ kind, state, width = 236 }: { kind: Stop; state: 'idle' | 'active' | 'done'; width?: number }) {
  const noise = useNoise(14, state === 'active');
  const on = state !== 'idle';
  const meta = {
    attackers: { Icon: Skull, title: 'Attackers', verdict: 'Only see noise', ok: false },
    database: { Icon: Database, title: 'OneHook database', verdict: 'Stored sealed · India 🇮🇳', ok: true },
    family: { Icon: Fingerprint, title: 'Friends & family', verdict: 'Not a match — locked', ok: false },
  }[kind];
  const { Icon } = meta;
  return (
    <motion.div
      animate={{ opacity: on ? 1 : 0.45, y: state === 'active' ? -4 : 0, scale: state === 'active' ? 1.03 : 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      className="rounded-[1.4rem] border bg-white/90 p-4 shadow-[0_24px_60px_-30px_rgba(10,11,16,0.45)] backdrop-blur"
      style={{ width, borderColor: state === 'active' ? 'rgba(255,143,199,0.7)' : 'rgba(10,11,16,0.08)' }}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full text-white" style={{ background: INK }}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-text/80">{meta.title}</p>
      </div>

      <div className="mt-3 h-[52px] rounded-xl bg-black/[0.035] px-3 py-2">
        {kind === 'attackers' && (
          <p className="font-mono text-[13px] tracking-widest text-black/45">{on ? noise : '··········'}</p>
        )}
        {kind === 'database' && (
          <div className="space-y-1">
            {[0, 1, 2].map((r) => (
              <motion.div
                key={r}
                initial={false}
                animate={{ opacity: on ? 1 : 0.3, width: on ? `${92 - r * 18}%` : '30%' }}
                transition={{ delay: on ? r * 0.15 : 0, duration: 0.4 }}
                className="h-2 rounded-full"
                style={{ background: r === 0 ? 'rgba(10,11,16,0.55)' : 'rgba(10,11,16,0.18)' }}
              />
            ))}
          </div>
        )}
        {kind === 'family' && (
          <div className="relative flex h-full items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-black/10">
              <Fingerprint className="h-6 w-6 text-black/45" />
              {state === 'active' && (
                <motion.span
                  className="absolute inset-x-0 h-[2px]"
                  style={{ background: PINK }}
                  animate={{ top: ['8%', '88%', '8%'] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </div>
            <p className="text-[11px] text-black/50">{state === 'active' ? 'Scanning…' : on ? 'Biometrics failed' : 'Waiting'}</p>
          </div>
        )}
      </div>

      <motion.p
        initial={false}
        animate={{ opacity: state === 'done' ? 1 : 0, x: state === 'done' && !meta.ok ? [0, -4, 4, -2, 0] : 0 }}
        transition={{ duration: 0.45 }}
        className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold"
        style={{ color: meta.ok ? '#16a34a' : '#b4235a' }}
      >
        {meta.ok ? <ShieldCheck className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {meta.verdict}
      </motion.p>
    </motion.div>
  );
}

/** The sealed message in transit. */
function Packet() {
  const noise = useNoise(6, true);
  return (
    <span
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[11px] text-white shadow-[0_10px_30px_-8px_rgba(255,143,199,0.8)]"
      style={{ background: INK }}
    >
      <Lock className="h-3 w-3" style={{ color: PINK }} /> {noise}
    </span>
  );
}

/* ── Screen 4: every screen, one conversation ──────────────────────────────── */


/** Tiny chat bubbles that appear once a device has the history. `stagger` 0 drops them all at once;
 *  `extra` appends a newer message (e.g. one that arrived while the device couldn't be synced). */
function MiniThread({
  on,
  delay = 0,
  size = 'sm',
  stagger = 0.12,
  newOn = false,
}: {
  on: boolean;
  delay?: number;
  size?: 'sm' | 'md';
  stagger?: number;
  /** Show the new message — it lands on every screen at the same moment. */
  newOn?: boolean;
}) {
  // the latest part of the same conversation the main phone shows
  const rows: { me: boolean; t: string; fresh: boolean }[] = ISHA_SENDS.slice(-3).map((m) => ({ me: m.me, t: m.t, fresh: false }));
  rows.push({ me: false, t: NEW_MESSAGE, fresh: true });
  const text = size === 'md' ? 'text-[7.5px]' : 'text-[6.5px]';
  return (
    <div className="flex h-full flex-col justify-end gap-1 p-2">
      {rows.map((r, i) => {
        const show = r.fresh ? newOn : on;
        return (
        <motion.span
          key={i}
          initial={false}
          animate={{ opacity: show ? 1 : 0, y: show ? 0 : stagger && !r.fresh ? 4 : -10 }}
          transition={{
            delay: show && !r.fresh ? delay + i * stagger : 0,
            duration: 0.3,
            ease: stagger && !r.fresh ? 'easeOut' : [0.34, 1.56, 0.64, 1],
          }}
          className={`max-w-[82%] rounded-lg px-1.5 py-1 leading-tight ${text} ${r.me ? 'self-end bg-[#0A0B10] text-white' : 'self-start bg-white text-text ring-1 ring-black/5'}`}
        >
          {r.t}
        </motion.span>
        );
      })}
    </div>
  );
}

/**
 * The earlier conversation as it appears on a device that has NOT received the history key (no iCloud /
 * Google key and not synced by QR): the bubbles are there, but sealed and unreadable.
 */
function HiddenThread({ clock, delay = 0 }: { clock: MotionValue<number>; delay?: number }) {
  const rows = [
    { me: false, w: '78%' },
    { me: true, w: '58%' },
    { me: true, w: '70%' },
  ];
  return (
    <div className="flex flex-col gap-1" aria-hidden="true">
      {rows.map((r, i) => (
        <Fragment key={i}>
          <HiddenRow clock={clock} start={delay + i * 0.1} me={r.me} w={r.w} />
        </Fragment>
      ))}
    </div>
  );
}

function HiddenRow({ clock, start, me, w }: { clock: MotionValue<number>; start: number; me: boolean; w: string }) {
  const opacity = useTransform(clock, [start, start + 0.3], [0, 1]);
  const y = useTransform(clock, [start, start + 0.3], [4, 0]);
  return (
    <motion.span
      style={{ width: w, opacity, y }}
      className={`flex items-center gap-1 rounded-lg px-1.5 py-1 ${
        me ? 'self-end bg-[#0A0B10]/75 text-white' : 'self-start bg-white text-text ring-1 ring-black/5'
      }`}
    >
      <Lock className="h-2 w-2 shrink-0 opacity-70" />
      <span className="h-[5px] flex-1 rounded-full bg-current opacity-30 blur-[1.5px]" />
    </motion.span>
  );
}

function DeviceLabel({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="mt-2.5 flex flex-col items-center text-center">
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-text/80">
        {icon} {title}
      </span>
      <span className="mt-0.5 max-w-[150px] text-balance text-[9px] leading-snug text-black/45">{sub}</span>
    </div>
  );
}

/** Pink "New" tag that pops onto a device the moment a new message lands on it. */
function NewTag({ on }: { on: boolean }) {
  return (
    <motion.span
      aria-hidden="true"
      className="absolute -right-2 -top-2 z-10 rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-white"
      style={{ background: PINK }}
      initial={false}
      animate={{ opacity: on ? 1 : 0, scale: on ? [0.6, 1.2, 1] : 0.6 }}
      transition={{ duration: 0.4 }}
    >
      New
    </motion.span>
  );
}

/** Small "synced" tick that pops onto a device (top-left; the "New" tag owns the top-right). */
function SyncedTick({ on, delay }: { on: boolean; delay: number }) {
  return (
    <motion.span
      // top-LEFT corner, so it never collides with the pink "New" tag on the top-right
      className="absolute -left-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-[#16a34a] text-white shadow"
      initial={false}
      animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
      transition={{ delay: on ? delay : 0, type: 'spring', stiffness: 320, damping: 15 }}
    >
      <Check className="h-3 w-3" />
    </motion.span>
  );
}

// Screen-4 timeline (s after arriving): devices appear 1.0; Apple key → iPad 1.5; Google key →
// Android 1.8; the cloud tries the Windows laptop and the camping phone and stops at a cross ("cloud not
// reachable") 1.4–2.1; the main phone then syncs the laptop by QR 2.8–4.0 and its whole history drops
// in at once; QR attempts from the main phone and the Android to the camping phone fail 3.3–4.1, yet
// new messages keep landing on it.
const SYNC = {
  appear: 1.0,
  ipad: 1.5,
  android: 1.8,
  keyHop: 0.9,
  cloudFail: 1.4,
  laptopQr: 2.8,
  phoneTry: 3.3,
  androidTry: 3.6,
  draw: 0.5,
};

type P = { x: number; y: number };
const fmt = (n: number) => n.toFixed(1);
/** Straight segments through the points. */
const poly = (pts: readonly P[]) => pts.map((p, i) => `${i ? 'L' : 'M'} ${fmt(p.x)} ${fmt(p.y)}`).join(' ');
/** A route that fails at `cross` (a point on the route): solid before it, dotted after it. */
const failRoute = (before: readonly P[], cross: P, after: readonly P[]) => ({
  first: poly([...before, cross]),
  rest: poly([cross, ...after]),
  at: cross,
});

const FAIL = '#b42318';

/** A solid line that reaches `at`, a cross mark there, then a dotted remainder: it cannot get through.
 *  Every part is read off the screen's scroll clock (seconds), so it draws and un-draws with scroll. */
function FailLine({ first, rest, at, start, clock, label, labelSide }: { first: string; rest: string; at: P; start: number; clock: MotionValue<number>; label: string; labelSide: 'left' | 'right' | 'above' }) {
  const hit = start + SYNC.draw;
  const firstLen = useTransform(clock, [start, hit], [0, 1]);
  const restOpacity = useTransform(clock, [hit + 0.05, hit + 0.45], [0, 1]);
  const crossScale = useTransform(clock, [hit, hit + 0.23, hit + 0.35], [0, 1.25, 1]);
  const crossOpacity = useTransform(clock, [hit, hit + 0.1], [0, 1]);
  const labelOpacity = useTransform(clock, [hit + 0.1, hit + 0.4], [0, 1]);
  const labelStyle =
    labelSide === 'left'
      ? { right: `calc(100% - ${at.x - 12}px)`, top: at.y, transform: 'translateY(-50%)' }
      : labelSide === 'right'
        ? { left: at.x + 12, top: at.y, transform: 'translateY(-50%)' }
        : { left: at.x, top: at.y - 14, transform: 'translate(-50%, -100%)' };
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <motion.path
          d={first}
          fill="none"
          stroke="rgba(10,11,16,0.35)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pathLength: firstLen }}
        />
        <motion.path
          d={rest}
          fill="none"
          stroke="rgba(10,11,16,0.28)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1.5 6"
          style={{ opacity: restOpacity }}
        />
      </svg>
      <motion.span
        className="absolute z-20 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#b42318] shadow ring-1 ring-[#b42318]/30"
        style={{ left: at.x, top: at.y, scale: crossScale, opacity: crossOpacity }}
      >
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
          <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </motion.span>
      <motion.span
        className="absolute z-20 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] shadow-sm ring-1 ring-[#b42318]/20"
        style={{ ...labelStyle, color: FAIL, opacity: labelOpacity }}
      >
        {label}
      </motion.span>
    </>
  );
}

/** A full (solid) straight line drawn when a sync succeeds. */
function OkLine({ d, start, clock, color = 'rgba(10,11,16,0.35)' }: { d: string; start: number; clock: MotionValue<number>; color?: string }) {
  const len = useTransform(clock, [start, start + SYNC.draw], [0, 1]);
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pathLength: len }}
      />
    </svg>
  );
}

// Device sizes (canvas px) — rows stand on a shared baseline so they line up exactly.
const DEV = {
  ipad: { w: 190, h: 132 },
  laptop: { w: 196, h: 129 }, // 120 screen + 9 base
  phone: { w: 90, h: 176 },
};
const SYNC_LAYOUT = {
  land: { cloud: { x: 590, y: 70 }, xL: 205, xR: 975, rowTop: 300, rowBot: 540, gutterL: 36, gutterR: 1144 },
  port: { cloud: { x: 210, y: 112 }, xL: 116, xR: 318, rowTop: 372, rowBot: 925, gutterL: 0, gutterR: 420 },
} as const;

/** A device standing on its row baseline (so a row lines up exactly), with its label just below. */
function Stand({ x, base, delay, clock, children, label, into }: { x: number; base: number; delay: number; clock: MotionValue<number>; children: ReactNode; label: ReactNode; into: P }) {
  const opacity = useTransform(clock, [delay, delay + 0.3], [0, 1]);
  const scale = useTransform(clock, [delay, delay + 0.32, delay + 0.45], [0.85, 1.02, 1]);
  const y = useTransform(clock, [delay, delay + 0.45], [12, 0]);
  return (
    <>
      {/* on the way out every device is gathered into the main phone */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-full"
        style={{ left: x, top: base, transformOrigin: 'bottom center', opacity, scale, y }}
        exit={{ left: into.x, top: into.y + 60, scale: 0.15, opacity: 0, transition: { duration: 0.55, ease: [0.5, 0, 0.75, 0] } }}
      >
        {children}
      </motion.div>
      <motion.div className="absolute -translate-x-1/2" style={{ left: x, top: base + 4, opacity, y }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
        {label}
      </motion.div>
    </>
  );
}

function SyncDevices({ layout, phone, W }: { layout: 'land' | 'port'; phone: Pose; W: number }) {
  // Screen 4 is scrubbed by scroll: the clock below is the screen's scroll progress in its old
  // choreography seconds, so every SYNC timing still applies, forwards and backwards.
  const clock = useSceneClock(SCENE_SYNC, SCENE_SECONDS[SCENE_SYNC]);
  const synced = {
    ipad: usePassed(clock, [SYNC.ipad + SYNC.keyHop]) > 0,
    android: usePassed(clock, [SYNC.android + SYNC.keyHop]) > 0,
    laptop: usePassed(clock, [SYNC.laptopQr + 1.2]) > 0,
  };
  const newOn = usePassed(clock, [NEW_AT]) > 0;
  const keyIn = (SYNC.appear + 0.5);
  const keyLen = (pulse: number) => pulse + SYNC.keyHop - SYNC.appear - 0.5;
  const ipadKeyOpacity = useTransform(clock, [keyIn, keyIn + 0.15 * keyLen(SYNC.ipad)], [0, 1]);
  const ipadKeyScale = useTransform(clock, [0, 0.15, 0.7, 0.85, 1].map((f) => keyIn + f * keyLen(SYNC.ipad)), [0.6, 1, 1, 1.25, 1]);
  const androidKeyOpacity = useTransform(clock, [keyIn, keyIn + 0.15 * keyLen(SYNC.android)], [0, 1]);
  const androidKeyScale = useTransform(clock, [0, 0.15, 0.7, 0.85, 1].map((f) => keyIn + f * keyLen(SYNC.android)), [0.6, 1, 1, 1.25, 1]);
  const qrAt = SYNC.laptopQr + SYNC.draw * 0.5;
  const qrOpacity = useTransform(clock, [qrAt, qrAt + 0.15], [0, 1]);
  const qrScale = useTransform(clock, [qrAt, qrAt + 0.28, qrAt + 0.4], [0.6, 1.15, 1]);

  const land = layout === 'land';
  const G0 = SYNC_LAYOUT[layout];
  // portrait: spread across the widened canvas, keeping the lines a clear margin from every device
  const G =
    layout === 'port'
      ? {
          ...G0,
          cloud: { ...G0.cloud, x: W / 2 },
          xL: spreadX(G0.xL, W),
          xR: spreadX(G0.xR, W),
          gutterL: spreadX(G0.xL, W) - DEV.laptop.w / 2 - 18,
          gutterR: spreadX(G0.xR, W) + DEV.phone.w / 2 + 52,
        }
      : G0;
  const { cloud, xL, xR, rowTop, rowBot, gutterL, gutterR } = G;

  // device edges (rows share a baseline: top row stands on rowTop, bottom row on rowBot)
  const ipadTop = rowTop - DEV.ipad.h;
  const androidTop = rowTop - DEV.phone.h;
  const laptopTop = rowBot - DEV.laptop.h;
  const campTop = rowBot - DEV.phone.h;
  const laptopLeft = xL - DEV.laptop.w / 2;
  const laptopRight = xL + DEV.laptop.w / 2;
  const campLeft = xR - DEV.phone.w / 2;
  const campRight = xR + DEV.phone.w / 2;
  const androidLeft = xR - DEV.phone.w / 2;
  const androidRight = xR + DEV.phone.w / 2;
  const lapMid = laptopTop + 60; // middle of the laptop's screen
  const campMid = rowBot - DEV.phone.h / 2;

  // Trunks: every cloud line leaves the cloud's centre (hidden behind it) together and only diverges
  // above its device — left trunk feeds the iPad then the laptop, right trunk the Android then the
  // camping phone.
  const C = { x: cloud.x, y: cloud.y };
  const toIpad = [C, { x: xL, y: C.y }, { x: xL, y: ipadTop }];
  const toAndroid = [C, { x: xR, y: C.y }, { x: xR, y: androidTop }];
  const enterY = land ? lapMid : laptopTop + 30;
  const crossYL = land ? 385 : 640;
  const cloudToLaptop = failRoute([C, { x: xL, y: C.y }, { x: gutterL, y: C.y }], { x: gutterL, y: crossYL }, [
    { x: gutterL, y: enterY },
    { x: laptopLeft, y: enterY },
  ]);
  const campEnterY = land ? campMid : campTop + 40;
  const cloudToCamp = failRoute([C, { x: xR, y: C.y }, { x: gutterR, y: C.y }], { x: gutterR, y: crossYL }, [
    { x: gutterR, y: campEnterY },
    { x: campRight, y: campEnterY },
  ]);

  // QR from the main phone (straight runs out of its side)
  const pw = (PW / 2) * phone.s;
  const ph = (PH / 2) * phone.s;
  const qrY = land ? rowBot - 75 : phone.cy + ph * 0.5;
  const qrLaptop = land
    ? [{ x: phone.cx - pw, y: qrY }, { x: laptopRight, y: qrY }]
    : [{ x: phone.cx - pw, y: qrY }, { x: xL, y: qrY }, { x: xL, y: laptopTop }];
  const qrMid = (() => {
    const segs = qrLaptop.slice(1).map((q, i) => ({ a: qrLaptop[i], b: q, l: Math.hypot(q.x - qrLaptop[i].x, q.y - qrLaptop[i].y) }));
    let half = segs.reduce((t, g) => t + g.l, 0) / 2;
    for (const g of segs) {
      if (half <= g.l) return { x: g.a.x + ((g.b.x - g.a.x) * half) / g.l, y: g.a.y + ((g.b.y - g.a.y) * half) / g.l };
      half -= g.l;
    }
    return qrLaptop[qrLaptop.length - 1];
  })();
  const phoneToCamp = land
    ? failRoute([{ x: phone.cx + pw, y: qrY }], { x: (phone.cx + pw + campLeft) / 2, y: qrY }, [{ x: campLeft, y: qrY }])
    : failRoute([{ x: phone.cx + pw, y: qrY }, { x: xR, y: qrY }], { x: xR, y: (qrY + campTop) / 2 }, [{ x: xR, y: campTop }]);
  // Android → camping phone: out of its side, straight down the inner gap, into the camping phone's side
  const aGap = land ? androidLeft - 40 : androidRight + 26;
  const aOut = land ? androidLeft : androidRight;
  const aY = rowTop - DEV.phone.h / 2;
  const cIn = land ? campLeft : campRight;
  const cY = campTop + 34;
  const androidToCamp = failRoute([{ x: aOut, y: aY }, { x: aGap, y: aY }], { x: aGap, y: (aY + cY) / 2 + (land ? 30 : 0) }, [
    { x: aGap, y: cY },
    { x: cIn, y: cY },
  ]);

  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6, ease: [0.7, 0, 1, 1] } }}>
      {/* the wiring between the devices: on the way to screen 5 it fades at once, so it never hangs in
          the air as an empty frame while the devices fly into the phone */}
      <motion.div className="absolute inset-0" exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeOut' } }}>
        {/* full lines: cloud → iPad, cloud → Android, and the QR from the main phone to the laptop */}
        <OkLine d={poly(toIpad)} start={SYNC.appear + 0.2} clock={clock} />
        <OkLine d={poly(toAndroid)} start={SYNC.appear + 0.2} clock={clock} />
        <OkLine d={poly(qrLaptop)} start={SYNC.laptopQr} clock={clock} color={PINK} />

        {/* the cloud can't reach the laptop or the camping phone; no device's QR reaches the camping phone */}
        <FailLine {...cloudToLaptop} start={SYNC.cloudFail} clock={clock} label="Cloud not reachable" labelSide="right" />
        <FailLine {...cloudToCamp} start={SYNC.cloudFail} clock={clock} label="Cloud not reachable" labelSide="left" />
        <FailLine {...phoneToCamp} start={SYNC.phoneTry} clock={clock} label="Out of reach" labelSide={land ? 'above' : 'right'} />
        <FailLine {...androidToCamp} start={SYNC.androidTry} clock={clock} label="Out of reach" labelSide="left" />

        {/* a key on each line leaving the cloud — it pulses as that device's key arrives */}
        {[
          { at: { x: xL, y: (C.y + ipadTop) / 2 }, opacity: ipadKeyOpacity, scale: ipadKeyScale },
          { at: { x: xR, y: (C.y + androidTop) / 2 }, opacity: androidKeyOpacity, scale: androidKeyScale },
        ].map((b, i) => (
          <motion.span
            key={i}
            className="absolute z-30 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-[0_8px_22px_-6px_rgba(255,143,199,0.9)]"
            style={{ left: b.at.x, top: b.at.y, background: INK, opacity: b.opacity, scale: b.scale }}
          >
            <KeyRound className="h-3.5 w-3.5" style={{ color: PINK }} />
          </motion.span>
        ))}

        {/* the QR, sitting in the middle of the line from the main phone to the laptop */}
        <motion.span
          className="absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-black/10"
          style={{ left: qrMid.x, top: qrMid.y, opacity: qrOpacity, scale: qrScale }}
        >
          <QrCode className="h-6 w-6 text-text" />
        </motion.span>

        {/* the moment the new message lands everywhere at once: no sync needed for new messages */}
        <motion.div
          aria-hidden="true"
          // phones: in the gap above the main phone · wide screens: just under it (clear of the cloud's caption)
          className={`absolute z-30 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[9px] font-semibold text-text shadow-[0_10px_26px_-12px_rgba(255,105,180,0.7)] ring-1 ${land ? '' : '-translate-y-full'}`}
          style={{ left: phone.cx, top: land ? phone.cy + ph + 16 : phone.cy - ph - 14, ['--tw-ring-color' as string]: 'rgba(255,143,199,0.55)' }}
          initial={false}
          animate={{ opacity: newOn ? 1 : 0, y: newOn ? 0 : 8, scale: newOn ? 1 : 0.92 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: PINK }} />
          New messages reach every device — no sync needed
        </motion.div>

      </motion.div>

      {/* top-left · iPad — synced from the cloud */}
      <Stand into={{ x: phone.cx, y: phone.cy }} x={xL} base={rowTop} delay={SYNC.appear + 0 * 0.12} clock={clock} label={<DeviceLabel icon={<AppleIcon className="h-3 w-3" />} title="iPad" sub="Synced from your cloud, automatically" />}>
        <div className="relative rounded-[18px] bg-[#0A0B10] p-[7px] shadow-[0_24px_50px_-26px_rgba(10,11,16,0.6)]" style={{ width: DEV.ipad.w, height: DEV.ipad.h }}>
          <div className="h-full w-full overflow-hidden rounded-[12px] bg-[#F6F6F4]">
            <MiniThread on={synced.ipad} newOn={newOn} />
          </div>
          <SyncedTick on={synced.ipad} delay={0} />
          <NewTag on={newOn} />
        </div>
      </Stand>

      {/* bottom-left · Windows laptop — cloud not reachable, so the main phone syncs it by QR and the
          whole history drops in at once */}
      <Stand
        into={{ x: phone.cx, y: phone.cy }}
        x={xL}
        base={rowBot}
        delay={SYNC.appear + 2 * 0.12}
        clock={clock}
        label={
          <DeviceLabel
            icon={
              <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                <path fill="currentColor" d="M0 2.2 6.5 1.3v6.2H0zm7.3-1L16 0v7.5H7.3zM0 8.3h6.5v6.3L0 13.7zm7.3 0H16V16l-8.7-1.2z" />
              </svg>
            }
            title="Windows laptop"
            sub={synced.laptop ? 'Synced by QR — everything, all at once' : 'Cloud not reachable — syncing by QR'}
          />
        }
      >
        <div style={{ width: DEV.laptop.w }}>
          <div className="relative h-[120px] w-full rounded-t-[12px] bg-[#0A0B10] p-[6px]">
            <div className="relative h-full w-full overflow-hidden rounded-[7px] bg-[#F6F6F4]">
              <motion.div className="absolute inset-0 flex flex-col gap-1 p-2" initial={false} animate={{ opacity: synced.laptop ? 0 : 1 }} transition={{ duration: 0.25 }}>
                <HiddenThread clock={clock} delay={SYNC.appear + 0.3} />
                <span className="mt-auto flex items-center gap-1 self-center rounded-md bg-white px-1.5 py-1 text-[6.5px] text-black/55 ring-1 ring-black/5">
                  <QrCode className="h-2.5 w-2.5" /> Waiting for a QR from your phone
                </span>
              </motion.div>
              <div className="absolute inset-0">
                <MiniThread on={synced.laptop} size="md" stagger={0} newOn={newOn} />
              </div>
            </div>
            <SyncedTick on={synced.laptop} delay={0} />
            <NewTag on={newOn} />
          </div>
          <div className="mx-auto h-[9px] w-[118%] -translate-x-[8%] rounded-b-[8px] bg-gradient-to-b from-[#c9cbd1] to-[#9fa3ab]" />
        </div>
      </Stand>

      {/* top-right · Android — synced from the cloud */}
      <Stand into={{ x: phone.cx, y: phone.cy }} x={xR} base={rowTop} delay={SYNC.appear + 1 * 0.12} clock={clock} label={<DeviceLabel icon={<GoogleIcon className="h-3 w-3" />} title="Android" sub="Synced from your cloud, automatically" />}>
        <div className="relative rounded-[18px] bg-[#0A0B10] p-[5px] shadow-[0_24px_50px_-26px_rgba(10,11,16,0.6)]" style={{ width: DEV.phone.w, height: DEV.phone.h }}>
          <span className="absolute left-1/2 top-[9px] z-10 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-black" />
          <div className="h-full w-full overflow-hidden rounded-[14px] bg-[#F6F6F4]">
            <MiniThread on={synced.android} newOn={newOn} />
          </div>
          <NewTag on={newOn} />
          <SyncedTick on={synced.android} delay={0} />
        </div>
      </Stand>

      {/* bottom-right · the camping phone: no cloud and no device in reach — earlier chat stays hidden,
          but every new message still lands */}
      <Stand into={{ x: phone.cx, y: phone.cy }} x={xR} base={rowBot} delay={SYNC.appear + 3 * 0.12} clock={clock} label={<DeviceLabel icon={<Tent className="h-3 w-3" />} title="Camping phone" sub="Out of everyone’s reach — new messages still arrive" />}>
        <div className="relative">
          {/* the campsite, kept below the lines that come in at the phone's sides */}
          <TreePine aria-hidden="true" className="absolute -left-9 bottom-0 h-8 w-8 text-[#2b3647]/30" />
          <TreePine aria-hidden="true" className="absolute -left-4 -bottom-0.5 h-5 w-5 text-[#2b3647]/25" />
          <TreePine aria-hidden="true" className="absolute -right-9 bottom-0 h-7 w-7 text-[#2b3647]/30" />
          <Tent aria-hidden="true" className="absolute -right-14 -bottom-0.5 h-6 w-6 text-[#2b3647]/45" />
          <div className="relative rounded-[18px] bg-[#0A0B10] p-[5px] shadow-[0_24px_50px_-26px_rgba(10,11,16,0.6)]" style={{ width: DEV.phone.w, height: DEV.phone.h }}>
            <div className="flex h-full w-full flex-col gap-1 overflow-hidden rounded-[14px] bg-[#F6F6F4] p-1.5">
              <HiddenThread clock={clock} delay={SYNC.appear + 0.3} />
              <span className="flex items-center gap-1 rounded-md bg-black/[0.05] px-1.5 py-1 text-[5.5px] leading-tight text-black/55">
                <Lock className="h-2.5 w-2.5 shrink-0" /> Earlier chat hidden — not synced by QR yet
              </span>
              <div className="mt-auto flex flex-col gap-1">
                <motion.span
                  initial={false}
                  animate={{ opacity: newOn ? 1 : 0, y: newOn ? 0 : -10 }}
                  transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                  className="self-start rounded-lg bg-white px-1.5 py-1 text-[6.5px] leading-tight text-text ring-1 ring-black/5"
                >
                  {NEW_MESSAGE}
                </motion.span>
              </div>
            </div>
            <motion.span
              className="absolute -right-2 -top-2 rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-white"
              style={{ background: PINK }}
              initial={false}
              animate={{ opacity: newOn ? 1 : 0, scale: newOn ? [0.6, 1.2, 1] : 0.6 }}
              transition={{ duration: 0.4 }}
            >
              New
            </motion.span>
          </div>
        </div>
      </Stand>
    </motion.div>
  );
}

/* ── Screen 1: a preview of every screen, mirrored around the phone ────────── */

type PreviewKind = 'lock' | 'recover' | 'screens' | 'language' | 'mr' | 'sealed';

const PREVIEWS: { kind: PreviewKind; title: string; sub: string }[] = [
  { kind: 'lock', title: 'Locked end to end', sub: 'Not even we can read it' },
  { kind: 'recover', title: 'Phone broke? Nothing lost', sub: 'Your sealed key brings it back' },
  { kind: 'screens', title: 'Every screen', sub: 'One conversation, everywhere' },
  { kind: 'language', title: 'Your language', sub: 'Live, translated captions' },
  { kind: 'mr', title: 'Mr OneHook', sub: 'You choose what he sees' },
  { kind: 'sealed', title: 'Every memory, sealed', sub: 'Photos, videos, voice, files' },
];

/** A tiny animated picture for each preview card. */
function PreviewArt({ kind, reduce }: { kind: PreviewKind; reduce: boolean }) {
  const noise = useNoise(7, kind === 'lock');
  if (kind === 'lock')
    return (
      <div className="flex items-center gap-1.5">
        <span className="rounded-lg bg-accent px-2 py-1 text-[9px] text-white">8 💛</span>
        <span className="flex items-center gap-1 rounded-lg bg-black/[0.05] px-2 py-1 font-mono text-[9px] text-black/45">
          <Lock className="h-2.5 w-2.5 text-accent" /> {noise}
        </span>
      </div>
    );
  if (kind === 'recover')
    return (
      <div className="flex items-center gap-2">
        <span className="relative h-8 w-5 rounded-[5px] border border-black/25">
          <svg viewBox="0 0 20 32" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <path d="M4 5 L11 14 L7 19 L14 27" fill="none" stroke={INK} strokeOpacity="0.5" strokeWidth="1" />
          </svg>
        </span>
        <motion.span
          className="grid h-6 w-6 place-items-center rounded-full text-white"
          style={{ background: INK }}
          animate={reduce ? undefined : { x: [0, 10, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <KeyRound className="h-3 w-3" style={{ color: PINK }} />
        </motion.span>
        <span className="relative grid h-8 w-5 place-items-center rounded-[5px] border border-black/25 bg-white">
          <Check className="h-3 w-3 text-[#16a34a]" />
        </span>
      </div>
    );
  if (kind === 'screens')
    return (
      <div className="flex items-end gap-1.5 text-accent/75">
        <Smartphone className="h-5 w-5" />
        <span className="h-px w-3 bg-black/20" />
        <Tablet className="h-6 w-6" />
        <span className="h-px w-3 bg-black/20" />
        <Laptop className="h-7 w-7" />
      </div>
    );
  if (kind === 'language')
    return (
      <div className="text-left leading-tight">
        <p className="text-[9px] text-black/45">कल शाम मिलते हैं?</p>
        <p className="text-[10px] font-medium text-text">Meet tomorrow evening?</p>
      </div>
    );
  if (kind === 'mr')
    return (
      <div className="flex items-center gap-1.5">
        <AlienScanner size={34} hideTooltips bare />
        <span className="rounded-lg rounded-tl-sm bg-black/[0.04] px-2 py-1 text-[9px] text-text">Try a walk tonight 💛</span>
      </div>
    );
  return (
    <div className="flex items-center gap-1.5">
      {[ImageIcon, Video, Mic, FileText].map((Icon, i) => (
        <span key={i} className="relative grid h-7 w-7 place-items-center rounded-lg bg-black/[0.04]">
          <Icon className="h-3.5 w-3.5 text-accent/70" />
          <span className="absolute -right-1 -top-1 grid h-3 w-3 place-items-center rounded-full bg-accent text-white">
            <Lock className="h-1.5 w-1.5" />
          </span>
        </span>
      ))}
    </div>
  );
}

function PreviewCard({ p, reduce }: { p: (typeof PREVIEWS)[number]; reduce: boolean }) {
  return (
    <div className="w-[214px] rounded-2xl border border-black/[0.07] bg-white/95 p-3.5 shadow-[0_20px_44px_-30px_rgba(10,11,16,0.5)] backdrop-blur">
      <div className="flex h-9 items-center">
        <PreviewArt kind={p.kind} reduce={reduce} />
      </div>
      <p className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] text-text/80">{p.title}</p>
      <p className="mt-0.5 text-[10px] text-black/45">{p.sub}</p>
    </div>
  );
}

/**
 * Screen 1 extras: six preview cards (one per later screen) mirrored three-and-three around the phone,
 * joined to it by faint lines, and the "free forever" heart glowing softly behind it.
 */
function ScreenPreviews({ layout, k, W }: { layout: 'land' | 'port'; k: number; W: number }) {
  const lite = useLite();
  const reduce = useReducedMotion() ?? false;
  const land = layout === 'land';
  const L = layout === 'port' ? portLayout(W) : LAYOUTS.land;
  const { cx, cy, s } = L.solo;
  const pw = (PW / 2) * s;
  const spots = land
    ? [
        { x: 215, y: 140 },
        { x: 215, y: 300 },
        { x: 215, y: 460 },
        { x: 965, y: 140 },
        { x: 965, y: 300 },
        { x: 965, y: 460 },
      ]
    : [
        // portrait: three above the phone, three below — mirrored top / bottom
        { x: 71, y: 345 },
        { x: 210, y: 345 },
        { x: 349, y: 345 },
        { x: 71, y: 955 },
        { x: 210, y: 955 },
        { x: 349, y: 955 },
      ].map((q) => ({ ...q, x: spreadX(q.x, W) }));
  // where each card's line meets the phone
  const meet = (i: number) =>
    land ? { x: i < 3 ? cx - pw : cx + pw, y: spots[i].y } : { x: spots[i].x, y: spots[i].y < cy ? cy - PH * s * 0.5 : cy + PH * s * 0.5 };
  const start = 1.3; // as the phone settles

  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
      {/* the free-forever heart, glowing behind the phone */}
      <motion.svg
        aria-hidden="true"
        viewBox="0 0 100 92"
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: cx, top: cy, width: land ? 760 : 400 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={reduce ? { opacity: 0.16, scale: 1 } : lite ? { opacity: 0.16, scale: 1 } : { opacity: [0, 0.18, 0.12, 0.18], scale: [0.8, 1, 1.03, 1] }}
        transition={reduce ? { duration: 0.3 } : lite ? { delay: 0.4, duration: 1.2 } : { delay: 0.4, duration: 4, times: [0, 0.3, 0.65, 1], repeat: Infinity, repeatType: 'reverse' }}
      >
        <path
          d="M50 88 C 18 66, 2 46, 2 27 C 2 12, 14 2, 28 2 C 38 2, 46 8, 50 16 C 54 8, 62 2, 72 2 C 86 2, 98 12, 98 27 C 98 46, 82 66, 50 88 Z"
          fill={PINK}
          style={lite ? undefined : { filter: 'blur(2px)' }}
        />
      </motion.svg>

      {/* faint lines from each card to the phone */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {spots.map((p, i) => {
          const m = meet(i);
          const from = land ? { x: p.x + (i < 3 ? 107 : -107), y: p.y } : { x: p.x, y: p.y + (p.y < cy ? 32 : -32) };
          return (
            <motion.path
              key={i}
              d={`M ${from.x} ${from.y} L ${m.x} ${m.y}`}
              fill="none"
              stroke="rgba(10,11,16,0.16)"
              strokeWidth={1.2}
              strokeDasharray="3 6"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: (start + 0.3 + i * 0.08) * k, duration: 0.5 * k }}
            />
          );
        })}
      </svg>

      {/* the six previews, mirrored */}
      {PREVIEWS.map((p, i) => {
        const at = spots[i];
        const fromSide = land ? (i < 3 ? -40 : 40) : 0;
        return (
          <motion.div
            key={p.kind}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: at.x, top: at.y, scale: land ? 1 : 0.64 }}
            initial={{ opacity: 0, x: fromSide, y: land ? 0 : 16 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay: (start + (i % 3) * 0.12 + (i >= 3 ? 0.06 : 0)) * k, type: 'spring', stiffness: 160, damping: 18 }}
          >
            <motion.div
              animate={reduce || lite ? undefined : { y: [0, -4, 0] }}
              transition={reduce || lite ? undefined : { duration: 4 + (i % 3) * 0.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
            >
              <PreviewCard p={p} reduce={reduce} />
            </motion.div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ── Screens 1–3: one persistent stage ─────────────────────────────────────── */

/** Isha's phone (talking to Rohan). Module-level so playback never restarts. */
const ISHA_HELLO = [
  { me: false, t: 'Did you get home okay? 💛' },
  { me: true, t: 'Just walked in. Tonight was perfect.' },
  { me: false, t: 'Same time next week?' },
  { me: true, t: 'Already in my calendar 🙂' },
] as const;
const ISHA_SENDS = [...ISHA_HELLO, { me: true, t: 'See you at 8? 💛' }] as const;
/** The one new message that lands on the main phone and every other device at the same instant. */
const NEW_MESSAGE = 'On my way 🚗';
const NEW_AT = 4.6; // s after arriving on screen 4
const ISHA_WITH_NEW = [...ISHA_SENDS, { me: false, t: NEW_MESSAGE }] as const;
const ROHAN_RECEIVES = [{ me: false, t: 'See you at 8? 💛' }] as const;
const NOTHING_YET: readonly { me: boolean; t: string }[] = [];
/** Scene index of the encryption journey (screen 2), scrubbed by scroll. */
const SCENE_JOURNEY = 1;
/** Scene indexes of screens 3 (broken phone, recovery) and 4 (every screen, synced). */
const SCENE_RECOVER = 2;
const SCENE_SYNC = 3;
/** Scene index of screen 5 (live, translated captions), scrubbed by scroll. */
const SCENE_LANG = 4;
/** Arriving on screen 5 the phone is gone this many seconds in (its exit: 0.45 s delay + 0.55 s). */
const PHONE_GONE = 1.0;

/** Real seconds since this mounted (huge when `active` is false, so `min(clock, since)` is just `clock`). */
function useSinceMount(active: boolean): MotionValue<number> {
  const since = useMotionValue(active ? 0 : Number.MAX_SAFE_INTEGER);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const s = (now - start) / 1000;
      since.set(s);
      if (s < 10) raf = requestAnimationFrame(tick); // well past every beat
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, since]);
  return since;
}

/**
 * `clock` held back to the real seconds since arrival, so scroll-driven beats can never get ahead of a
 * time-driven exit that plays on arrival. Slow scrolling: simply `clock`. A brisk scroll: the beats
 * play at their designed pace instead of popping in.
 */
function useHandoffClock(clock: MotionValue<number>, since: MotionValue<number>): MotionValue<number> {
  return useTransform(() => Math.min(clock.get(), since.get()));
}

const PW = 230; // phone width in canvas px
const PH = 473; // phone height (230 wide, 9:19.5 screen + bezel)

type Pose = { cx: number; cy: number; s: number };
const LAYOUTS = {
  land: {
    w: 1180,
    h: 600,
    solo: { cx: 590, cy: 300, s: 1.12 },
    left: { cx: 115, cy: 300, s: 1 },
    right: { cx: 1065, cy: 300, s: 1 },
    broken: { cx: 300, cy: 392, s: 0.86 },
    fresh: { cx: 870, cy: 300, s: 0.9 },
    cloud: { x: 590, y: 96 },
    // screen 4 — new phone centred, everything else set aside, devices mirrored left / right
    center: { cx: 590, cy: 366, s: 0.76 },
    aside: { cx: -1500, cy: 392, s: 0.86 },
    cloud4: { x: 590, y: 70 },
  },
  port: {
    w: 420,
    h: 1300,
    // phones: compositions packed into the band each screen shows, so it can use the full width
    solo: { cx: 210, cy: 650, s: 1.0 },
    left: { cx: 92, cy: 300, s: 0.72 },
    right: { cx: 328, cy: 862, s: 0.72 },
    broken: { cx: 106, cy: 700, s: 0.8 },
    fresh: { cx: 314, cy: 700, s: 0.8 },
    cloud: { x: 210, y: 345 },
    center: { cx: 210, cy: 612, s: 0.56 },
    aside: { cx: -900, cy: 1040, s: 0.8 },
    cloud4: { x: 210, y: 112 },
  },
} as const;
const at = (p: Pose) => ({ left: p.cx - PW / 2, top: p.cy - PH / 2, scale: p.s });
/** Portrait x → x on a canvas widened to W: the centre stays put, everything else moves out evenly. */
const spreadX = (x: number, W: number) => W / 2 + (x - 210) * (W / 420);
function portLayout(W: number) {
  const P = LAYOUTS.port;
  const pose = (q: Pose): Pose => ({ ...q, cx: q.cx < -100 ? q.cx : spreadX(q.cx, W) });
  return {
    ...P,
    w: W,
    solo: pose(P.solo),
    left: pose(P.left),
    right: pose(P.right),
    broken: pose(P.broken),
    fresh: pose(P.fresh),
    center: pose(P.center),
    aside: P.aside,
    cloud: { ...P.cloud, x: W / 2 },
    cloud4: { ...P.cloud4, x: W / 2 },
  };
}
/** Portrait (phone) camera per screen 1–5: the vertical band of the 420×1300 canvas each scene uses. */
const PORT_VIEWS: { y: number; h: number }[] = [
  { y: 285, h: 730 }, // 1 · phone + preview cards
  { y: 100, h: 935 }, // 2 · zig-zag: phone + box, box on the route, box + phone
  { y: 280, h: 660 }, // 3 · the two phones side by side under the cloud
  { y: 66, h: 900 }, // 4 · devices around the cloud
  { y: 0, h: 1300 }, // 5 · captions (unchanged)
];

// Screen-2 timeline (ms after arriving on it): Rohan drops at 0.5s, Isha sends at 1.8s, then the
// message passes attackers → database → family and lands on Rohan's phone.
const JOURNEY_TIMES = [2600, 4300, 6000, 7900];
const SEND_DELAY = 1800;
// Screen-3 timeline (s): fall 0–0.7, impact 0.7, screen dies 1.1, key rises to the cloud 1.7–2.5;
// a white box (tilted like the fallen phone) slides in from the right 2.6–3.4, its lid slides down
// and away behind the text 3.6, the key reaches the new phone 4.2, history revives from 4.4.
const FALL = 0.7;
const TILT = 14; // the fallen phone's angle — the box and new phone share it
const BOX_IN = 2.6;
const LID_OFF = 3.6;
const LID_TRAVEL = 4000; // canvas px the lid slides down — well past the bottom of any window
const KEY_IN = 4.2;
const RESTORE_AT = 4.4;

/** Crack lines drawn across a broken screen. */
function Cracks({ delay }: { delay: number }) {
  const lines = [
    'M150 330 L110 260 L132 210 L80 140 L96 60',
    'M150 330 L190 270 L176 200 L214 150',
    'M150 330 L70 360 L30 420',
    'M150 330 L210 380 L196 470 L232 520',
    'M110 260 L40 250 M132 210 L188 190 M176 200 L120 160 M196 470 L130 500',
  ];
  return (
    <svg viewBox="0 0 230 473" className="absolute inset-0 h-full w-full" aria-hidden="true">
      {lines.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="none"
          stroke="white"
          strokeOpacity={i === 4 ? 0.55 : 0.9}
          strokeWidth={i === 4 ? 0.9 : 1.4}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: delay + i * 0.05, duration: 0.35, ease: 'easeOut' }}
        />
      ))}
      <motion.circle
        cx="150"
        cy="330"
        r="10"
        fill="white"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0.9, 0.35], scale: [0, 1.4, 1] }}
        transition={{ delay, duration: 0.4 }}
        style={{ transformOrigin: '150px 330px' }}
      />
    </svg>
  );
}

/** Screen 3: the sealed key flies broken phone → cloud → new phone, scrubbed by the screen's clock. */
function KeyFlight({ clock, path }: { clock: MotionValue<number>; path: { left: number[]; top: number[] } }) {
  const t0 = 1.7;
  const span = KEY_IN - t0;
  const marks = [0, 0.32, 0.76, 1].map((f) => t0 + f * span);
  const left = useTransform(clock, marks, path.left);
  const top = useTransform(clock, marks, path.top);
  const opacity = useTransform(clock, marks, [0, 1, 1, 0]);
  const scale = useTransform(clock, marks, [0.6, 1, 1, 0.7]);
  return (
    <motion.span
      className="absolute z-30 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-[0_10px_30px_-6px_rgba(255,143,199,0.9)]"
      style={{ background: INK, left, top, opacity, scale }}
    >
      <KeyRound className="h-5 w-5" style={{ color: PINK }} />
    </motion.span>
  );
}

/**
 * Screens 1–3 share this stage, so the phone never leaves.
 *  1 · Isha's phone drops in and a conversation plays.
 *  2 · It glides left, Rohan's phone drops in, Isha sends a message and it travels past attackers
 *      (noise), OneHook's database (sealed) and friends & family (biometrics fail) to Rohan.
 *  3 · Isha's phone falls and breaks; her sealed key rises to the cloud, a new phone drops in, the
 *      key flies into it and her whole history comes back.
 */
function PhonesStage({ index }: { index: number }) {
  const lite = useLite();
  const reduce = useReducedMotion() ?? false;
  const still = useMotionValue(0);
  const journey = index === 1;
  const broken = index >= 2;
  const syncing = index >= 3;
  const lang = index >= 4; // screen 5: everything gathers into the phone, which becomes the caption window
  const k = reduce ? 1 / 3 : 1;
  // switched to without animation (scrolling up, or a screen that has already played)
  const instant = useStoryInstant();
  // Arriving straight onto screen 4 (scrolling back up from screen 5): the new phone is simply there —
  // no slide-in, no unboxing, history already on it.
  const direct = useRef(index >= 3).current;
  // The new phone (with its box) is built when we arrive on screen 3 coming FORWARD, so its unboxing
  // plays then. Coming back up from screen 4 it is already there, finished — nothing is rebuilt. It
  // starts "already unboxed" when the stage itself first mounts on screen 4/5.
  const [freshGen, setFreshGen] = useState(0);
  const [freshDirect, setFreshDirect] = useState(index >= 3);
  const prevIndex = useRef(index);
  useEffect(() => {
    if (index === 2 && prevIndex.current < 2) {
      setFreshGen((g) => g + 1);
      setFreshDirect(false);
    }
    prevIndex.current = index;
  }, [index]);
  // Screen 3 is scrubbed by scroll (the fall, impact, cracks and shards stay physical, played on
  // arrival): the screen dims, the cloud appears, the key flies, the new phone's box slides in, its
  // lid comes off, the key lands and the history comes back, each at its old second mark.
  const recoverClock = useSceneClock(SCENE_RECOVER, SCENE_SECONDS[SCENE_RECOVER]);
  const after3 = index > SCENE_RECOVER;
  const [dimPassed, cloudPassed, restorePassed, badgePassed] = [
    usePassed(recoverClock, [1.5]),
    usePassed(recoverClock, [1.4]),
    usePassed(recoverClock, [RESTORE_AT]),
    usePassed(recoverClock, [RESTORE_AT + 1.5]),
  ];
  const dimmed = broken && (after3 || dimPassed > 0);
  const cloudIn = after3 || cloudPassed > 0;
  const restoring = after3 || restorePassed > 0;
  const badgeOn = !syncing && badgePassed > 0;
  const freshX = useTransform(recoverClock, [BOX_IN, BOX_IN + 0.85], [1100, 0]);
  const lidY = useTransform(recoverClock, [LID_OFF, LID_OFF + 1.3], [0, LID_TRAVEL]);
  const lidOpacity = useTransform(recoverClock, [LID_OFF, LID_OFF + 0.91, LID_OFF + 1.3], [1, 1, 0]);
  const keyGlow = useTransform(recoverClock, [KEY_IN, KEY_IN + 0.45, KEY_IN + 0.9], [0, 1, 0]);

  // screen 4: the new message lands at NEW_AT seconds into the screen's scroll band
  const syncClock = useSceneClock(SCENE_SYNC, SCENE_SECONDS[SCENE_SYNC]);
  const newMsgPassed = usePassed(syncClock, [NEW_AT]);
  const newMsg = syncing && (index > SCENE_SYNC || newMsgPassed > 0);

  // Screen 2 (the journey) is scrubbed by scroll: its old second-based beats become points in the
  // screen's scroll band, so they play forward and rewind with the reader. The beats: Isha sends
  // (SEND_DELAY), the route fades in (1.4 s), the message reaches each checkpoint and finally Rohan
  // (JOURNEY_TIMES).
  const journeyP = useSceneProgress(SCENE_JOURNEY);
  const J = SCENE_SECONDS[SCENE_JOURNEY];
  const sendPassed = usePassed(journeyP, [SEND_DELAY / 1000 / J]);
  const stagePassed = usePassed(journeyP, JOURNEY_TIMES.map((ms) => ms / 1000 / J));
  const stage = journey ? stagePassed : 0;
  // once past screen 2 the message simply stays in her thread
  const sent = index > SCENE_JOURNEY || (journey && sendPassed > 0);
  const rohanGot = journey && stagePassed >= JOURNEY_TIMES.length;
  const routeOpacity = useTransform(journeyP, [1.4 / J, 1.9 / J], [0, 1]);

  const stops: Stop[] = ['attackers', 'database', 'family'];
  const stateOf = (i: number) => (stage === i + 1 ? 'active' : stage > i + 1 ? 'done' : 'idle') as 'idle' | 'active' | 'done';
  const spring = { type: 'spring' as const, stiffness: 70, damping: 16, mass: 1 };
  const travel = { duration: reduce ? 0.2 : 0.9, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] };

  return (
    <FitCanvas land={LAYOUTS.land} port={LAYOUTS.port} portView={PORT_VIEWS[index]}>
      {(layout, W) => {
        const L = layout === 'port' ? portLayout(W) : LAYOUTS.land;
        const ishaPose = syncing ? L.aside : broken ? L.broken : journey ? L.left : L.solo;
        const isha = at(ishaPose);
        const rohan = at(L.right);
        const fresh = at(syncing ? L.center : L.fresh);
        const tilt = layout === 'port' ? 0 : TILT; // phones: the two phones sit upright, side by side
        const ishaRotate = broken ? tilt : journey ? (layout === 'port' ? 6 : 0) : -6;
        // key path: broken phone → cloud → new phone
        const keyPath = {
          left: [L.broken.cx, L.cloud.x, L.cloud.x, L.fresh.cx],
          top: [L.broken.cy, L.cloud.y, L.cloud.y, L.fresh.cy],
        };

        return (
          <div className="relative h-full w-full" style={{ perspective: 1400 }}>
            {/* screen 1: a preview of every later screen, mirrored around the phone */}
            <AnimatePresence>
              {index === 0 && (
                <Fragment key="previews">
                  <ScreenPreviews layout={layout} k={k} W={L.w} />
                </Fragment>
              )}
            </AnimatePresence>

            {/* screen 2: route + checkpoints + travelling message (behind the phones) */}
            <AnimatePresence>
              {journey && (
                <motion.div
                  key="journey"
                  className="absolute inset-0"
                  style={{ opacity: routeOpacity }}
                  exit={{ opacity: 0, transition: { duration: 0.3 } }}
                >
                  {layout === 'land' ? (
                    <>
                      <div className="absolute left-[262px] right-[262px] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-black/10">
                        <motion.div
                          className="absolute left-0 top-0 h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${INK}, ${PINK})` }}
                          animate={{ width: `${(stage / 4) * 100}%` }}
                          transition={travel}
                        />
                      </div>
                      {stops.map((s, i) => {
                        const x = 262 + ((i + 1) / 4) * (L.w - 524);
                        const above = i !== 1;
                        return (
                          <div key={s} className="absolute" style={{ left: x, top: L.h / 2 }}>
                            <span
                              className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
                              style={{ borderColor: stage >= i + 1 ? PINK : 'rgba(10,11,16,0.2)' }}
                            />
                            <span
                              aria-hidden="true"
                              className="absolute left-0 -translate-x-1/2 border-l border-dashed border-black/20"
                              style={above ? { bottom: 8, height: 46 } : { top: 8, height: 46 }}
                            />
                            <div className="absolute left-0 -translate-x-1/2" style={above ? { bottom: 54 } : { top: 54 }}>
                              <Checkpoint kind={s} state={stateOf(i)} />
                            </div>
                          </div>
                        );
                      })}
                      <motion.div
                        className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                        initial={{ left: 262, opacity: 0 }}
                        animate={{ left: 262 + (stage / 4) * (L.w - 524), opacity: stage >= 1 && stage < 4 ? 1 : 0 }}
                        transition={travel}
                      >
                        <Packet />
                      </motion.div>
                    </>
                  ) : (
                    (() => {
                      // phones, a zig-zag read top to bottom — one thing per zone, nothing crowded:
                      //   Isha (left)            · Attackers (right)
                      //            OneHook database (on the route, the message passes through it)
                      //   Friends & family (left) · Rohan (right)
                      // The route is one straight line that starts behind Isha's phone and ends behind
                      // Rohan's, crossing the middle; the side boxes are tied to it by level (parallel)
                      // dashed lines that run in behind the phones too.
                      const A = { x: L.left.cx, y: L.left.cy };
                      const B = { x: L.right.cx, y: L.right.cy };
                      const atY = (y: number) => {
                        const t = (y - A.y) / (B.y - A.y);
                        return { t, x: A.x + (B.x - A.x) * t, y };
                      };
                      const along = (t: number) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
                      const CARD_HALF = 93; // half the box width (186)
                      const GAP = 22; // dashed connector between the route and a side box
                      const ishaBottom = L.left.cy + (PH / 2) * L.left.s;
                      const rohanTop = L.right.cy - (PH / 2) * L.right.s;
                      // the side boxes keep their places beside the phones, but their lines leave the
                      // route where it is visible: just below Isha's phone and just above Rohan's
                      const dots = [atY(ishaBottom + 18), atY((ishaBottom + rohanTop) / 2), atY(rohanTop - 18)];
                      const boxY = [L.left.cy - 20, 0, L.right.cy + 20];
                      // side boxes sit at the outer edges (clear of the phones); their connectors run level
                      // from the box into the route behind the phone
                      const MARGIN = 14;
                      const rightX = Math.max(L.left.cx + (PW / 2) * L.left.s + GAP + CARD_HALF, L.w - MARGIN - CARD_HALF);
                      const leftX = Math.min(L.right.cx - (PW / 2) * L.right.s - GAP - CARD_HALF, MARGIN + CARD_HALF);
                      const cards = dots.map((d, i) =>
                        i === 1
                          ? { x: d.x, y: d.y, edge: d.x } // centred on the route
                          : i === 0
                            ? { x: rightX, y: boxY[0], edge: rightX - CARD_HALF }
                            : { x: leftX, y: boxY[2], edge: leftX + CARD_HALF },
                      );
                      const tAt = (st: number) => (st <= 0 ? 0 : st >= 4 ? 1 : dots[st - 1].t);
                      const head = along(tAt(stage));
                      return (
                        <>
                          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                            <defs>
                              <linearGradient id="journey-port" x1={A.x} y1={A.y} x2={B.x} y2={B.y} gradientUnits="userSpaceOnUse">
                                <stop offset="0" stopColor={INK} />
                                <stop offset="1" stopColor={PINK} />
                              </linearGradient>
                            </defs>
                            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(10,11,16,0.12)" strokeWidth={3} strokeLinecap="round" />
                            <motion.line
                              x1={A.x}
                              y1={A.y}
                              stroke="url(#journey-port)"
                              strokeWidth={3}
                              strokeLinecap="round"
                              initial={{ x2: A.x, y2: A.y }}
                              animate={{ x2: head.x, y2: head.y }}
                              transition={travel}
                            />
                            {stops.map((s, i) =>
                              i === 1 ? null : (
                                <line key={s} x1={dots[i].x} y1={dots[i].y} x2={cards[i].edge} y2={cards[i].y} stroke="rgba(10,11,16,0.25)" strokeWidth={1.5} strokeDasharray="4 6" />
                              ),
                            )}
                          </svg>
                          {stops.map((s, i) => {
                            const d = dots[i];
                            return (
                              <span
                                key={`dot-${s}`}
                                className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
                                style={{ left: d.x, top: d.y, borderColor: stage >= i + 1 ? PINK : 'rgba(10,11,16,0.2)' }}
                              />
                            );
                          })}
                          {stops.map((s, i) => (
                            <div key={s} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: cards[i].x, top: cards[i].y }}>
                              <Checkpoint kind={s} state={stateOf(i)} width={186} />
                            </div>
                          ))}
                          <motion.div
                            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                            initial={{ left: A.x, top: A.y, opacity: 0 }}
                            animate={{ left: head.x, top: head.y, opacity: stage >= 1 && stage < 4 ? 1 : 0 }}
                            transition={travel}
                          >
                            <Packet />
                          </motion.div>
                        </>
                      );
                    })()
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* screen 4: iPad · Windows laptop · Android · camping phone, mirrored around the new
                phone — rendered before the cloud so every line starts hidden behind it */}
            <AnimatePresence>
              {syncing && !lang && (
                <Fragment key="sync">
                  <SyncDevices layout={layout} phone={L.center} W={L.w} />
                </Fragment>
              )}
            </AnimatePresence>

            {/* screen 3: the cloud that holds the sealed key, and the key's flight */}
            <AnimatePresence>
              {broken && !lang && (
                <motion.div key="recovery" className="absolute inset-0" exit={{ opacity: 0, transition: { duration: 0.3 } }}>
                  <motion.div
                    className="absolute z-10 flex -translate-x-1/2 -translate-y-[40px] flex-col items-center gap-2"
                    initial={{ left: direct ? L.cloud4.x : L.cloud.x, top: direct ? L.cloud4.y : L.cloud.y, opacity: 0, y: 24, scale: 0.9 }}
                    animate={{
                      left: syncing ? L.cloud4.x : L.cloud.x,
                      top: syncing ? L.cloud4.y : L.cloud.y,
                      opacity: cloudIn ? 1 : 0,
                      y: cloudIn ? 0 : 24,
                      scale: cloudIn ? 1 : 0.9,
                    }}
                    transition={{
                      left: spring,
                      top: spring,
                      default: { duration: direct ? 0.3 : 0.6, ease: [0.22, 1, 0.36, 1] },
                    }}
                  >
                    <span className="flex h-20 w-48 items-center justify-center gap-3 rounded-full bg-white shadow-[0_24px_60px_-28px_rgba(10,11,16,0.5)] ring-1 ring-black/5">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-black/[0.04]">
                        <AppleIcon className="h-5 w-5 text-text" />
                      </span>
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-black/[0.04]">
                        <GoogleIcon className="h-5 w-5" />
                      </span>
                      {/* "+": not just Apple and Google */}
                      <span className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-black/20 text-black/45" aria-label="and more">
                        <Plus className="h-5 w-5" />
                      </span>
                    </span>
                    <motion.span
                      className="w-max max-w-[300px] text-balance text-center text-[10px] font-semibold uppercase leading-relaxed tracking-[0.22em] text-black/40"
                      animate={{ opacity: syncing && layout === 'port' ? 0 : 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      Your key, sealed in your cloud account — Apple, Google and more
                    </motion.span>
                  </motion.div>
                  {index === SCENE_RECOVER && <KeyFlight clock={recoverClock} path={keyPath} />}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Isha's phone: drops in once, then glides between poses — and on screen 3 falls & breaks. Once
                everything has moved on to the new phone (screen 4+) it fades out and is unmounted, so a
                hidden phone mock isn't kept alive behind the stage. */}
            <AnimatePresence>
            {!syncing && (
            <motion.div
              key="isha"
              className="absolute z-20"
              style={{ width: PW, height: PH, transformStyle: 'preserve-3d' }}
              initial={
                reduce
                  ? { ...isha, opacity: 0, rotate: ishaRotate }
                  : { left: isha.left, top: -PH - 260, scale: isha.scale * 0.88, rotate: -26, rotateX: 38, rotateY: -12, opacity: 0 }
              }
              animate={{ ...isha, rotate: ishaRotate, rotateX: 0, rotateY: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.35 } }}
              transition={
                reduce
                  ? { duration: 0.3 }
                  : broken
                    ? {
                        // gravity: accelerate into the floor
                        top: { duration: FALL, ease: [0.55, 0, 1, 0.45] },
                        left: { duration: FALL, ease: 'easeIn' },
                        scale: { duration: FALL, ease: 'easeIn' },
                        rotate: { duration: FALL, ease: 'easeIn' },
                        opacity: { duration: 0.3 },
                      }
                    : {
                        top: { type: 'spring', stiffness: 62, damping: 12, mass: 1.2 },
                        left: spring,
                        scale: spring,
                        rotate: { type: 'spring', stiffness: 55, damping: 11 },
                        rotateX: { type: 'spring', stiffness: 60, damping: 12 },
                        rotateY: { type: 'spring', stiffness: 60, damping: 12 },
                        opacity: { duration: 0.35 },
                      }
              }
            >
              {/* impact: a small bounce + shake the moment it hits */}
              <motion.div
                animate={broken && !reduce ? { x: [0, 0, -9, 8, -5, 3, 0], y: [0, 0, -14, 0, -4, 0, 0] } : { x: 0, y: 0 }}
                transition={broken && !reduce ? { duration: 1.3, times: [0, 0.54, 0.62, 0.7, 0.78, 0.86, 1] } : { duration: 0.3 }}
                className="relative"
              >
                <motion.div
                  animate={reduce || lite || index > 0 ? { y: 0 } : { y: [0, -6, 0] }}
                  transition={reduce || lite || index > 0 ? { duration: 0.4 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
                  className="relative"
                >
                  <motion.div
                    animate={{ opacity: dimmed ? 0.42 : 1, filter: dimmed ? 'grayscale(1)' : 'grayscale(0)' }}
                    transition={{ duration: 0.6 }}
                  >
                    <ManifestoPhone
                      progress={still}
                      reduce
                      initialTab="messages"
                      messagesOnly
                      liveThread={sent ? ISHA_SENDS : ISHA_HELLO}
                      liveDelay={sent || instant ? 0 : reduce ? 300 : 800}
                      liveSpeed={instant ? 0.01 : 1}
                      contactName="Rohan"
                      contactPhoto="/media/profile-demo/profile-male-1.jpg"
                      ownerName="Isha"
                      ownerAge={27}
                      ownerPhoto="/media/profile-demo/profile-1.jpg"
                      className="relative isolate"
                    />
                  </motion.div>

                  {/* broken glass: the screen dies, cracks spread from the impact point */}
                  <AnimatePresence>
                    {broken && (
                      <motion.div
                        key="cracked"
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-[11px] overflow-hidden rounded-[2.25rem]"
                        exit={{ opacity: 0, transition: { duration: 0.3 } }}
                      >
                        <motion.div
                          className="absolute inset-0 bg-[#0A0B10]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0, 0.6, 0.25, 0.85] }}
                          transition={{ delay: FALL * k + 0.05, duration: 0.5, times: [0, 0.3, 0.55, 1] }}
                        />
                        <Cracks delay={FALL * k} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!reduce && index === 0 && (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2.9rem]">
                      <motion.span
                        className="absolute -inset-y-10 w-24 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                        initial={{ left: '-40%' }}
                        animate={{ left: '140%' }}
                        transition={{ delay: 1.05, duration: 1.1, ease: 'easeInOut' }}
                      />
                    </div>
                  )}
                </motion.div>

                {/* glass shards burst out on impact */}
                {broken && !reduce && (
                  <div aria-hidden="true" className="pointer-events-none absolute left-[60%] top-[72%]">
                    {[
                      [-46, -38, -40],
                      [38, -52, 30],
                      [62, -14, 70],
                      [-60, 6, -80],
                      [14, -70, 15],
                      [-24, -60, -20],
                    ].map(([dx, dy, rot], i) => (
                      <motion.span
                        key={i}
                        className="absolute block h-2.5 w-1.5 rounded-[1px] bg-white shadow"
                        style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
                        initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                        animate={{ x: dx, y: [0, dy, dy + 70], opacity: [0, 1, 0], rotate: rot }}
                        transition={{ delay: FALL, duration: 0.9, ease: 'easeOut', times: [0, 0.35, 1] }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>

              {/* contact shadow */}
              <motion.span
                aria-hidden="true"
                className="absolute -bottom-8 left-1/2 h-6 w-[78%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-xl"
                initial={reduce ? { opacity: 0.55 } : { opacity: 0, scaleX: 0.3 }}
                animate={{ opacity: 0.55, scaleX: 1 }}
                transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 }}
              />
            </motion.div>
            )}
            </AnimatePresence>

            {/* Rohan's phone: drops in from the top on screen 2 */}
            <AnimatePresence>
              {journey && (
                <motion.div
                  key="rohan"
                  className="absolute z-20"
                  style={{ width: PW, height: PH, transformStyle: 'preserve-3d' }}
                  initial={reduce ? { ...rohan, opacity: 0 } : { left: rohan.left, top: -PH - 260, scale: rohan.scale * 0.88, rotate: 18, rotateX: 34, opacity: 0 }}
                  animate={{ ...rohan, rotate: layout === 'port' ? 6 : 0, rotateX: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { top: -PH - 260, rotate: 12, opacity: 0, transition: { duration: 0.5, ease: 'easeIn' } }}
                  transition={
                    reduce
                      ? { duration: 0.3 }
                      : {
                          top: { type: 'spring', stiffness: 62, damping: 12, mass: 1.2, delay: 0.5 },
                          scale: { duration: 0.9, delay: 0.5 },
                          rotate: { type: 'spring', stiffness: 55, damping: 11, delay: 0.5 },
                          rotateX: { type: 'spring', stiffness: 60, damping: 12, delay: 0.5 },
                          opacity: { duration: 0.35, delay: 0.5 },
                        }
                  }
                >
                  <ManifestoPhone
                    progress={still}
                    reduce
                    initialTab="messages"
                      messagesOnly
                    liveThread={rohanGot ? ROHAN_RECEIVES : NOTHING_YET}
                    liveDelay={0}
                    ownerName="Rohan"
                    ownerAge={29}
                    ownerPhoto="/media/profile-demo/profile-male-1.jpg"
                    className="relative isolate"
                  />
                  <span aria-hidden="true" className="absolute -bottom-8 left-1/2 h-6 w-[78%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-xl" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* screen 5: the caption window and its copies, covering the whole space */}
            <AnimatePresence>
              {lang && (
                <Fragment key="burst">
                  <div className="absolute inset-y-0" style={{ left: (L.w - (layout === 'port' ? LAYOUTS.port.w : L.w)) / 2, width: layout === 'port' ? LAYOUTS.port.w : L.w }}>
                    {/* prevIndex still holds the previous screen during this render */}
                    <TranslationBurst layout={layout} handoff={prevIndex.current === SCENE_SYNC && !instant} />
                  </div>
                </Fragment>
              )}
            </AnimatePresence>

            {/* Isha's NEW phone: a plain white box — tilted at the same angle as the fallen phone —
                slides in from the right. Its lid slides down and away (out of view, behind the text),
                leaving the new phone in its tray at that same angle. The encrypted key arrives and
                her history revives on its own. */}
            <AnimatePresence>
              {broken && (
                <motion.div
                  key={`fresh-${freshGen}`}
                  className="absolute z-20"
                  style={{ width: PW, height: PH, transformOrigin: 'center' }}
                  initial={
                    freshDirect
                      ? { ...fresh, rotate: 0, x: 0, opacity: lang ? 0 : 1 }
                      : reduce
                        ? { ...fresh, rotate: tilt, opacity: 0 }
                        : { ...fresh, rotate: tilt, x: 0, opacity: 1 }
                  }
                  animate={
                    lang
                      ? // screen 5: with every device gathered inside it, the phone drops and shrinks into the caption window
                        { left: L.w / 2 - PW / 2, top: L.h / 2 - PH / 2 + 70, scale: fresh.scale * 0.42, rotate: 10, x: 0, opacity: 0 }
                      : { ...fresh, rotate: syncing ? 0 : tilt, x: 0, opacity: 1 }
                  }
                  exit={reduce ? { opacity: 0 } : { x: 1100, transition: { duration: 0.55, ease: [0.5, 0, 0.75, 0] } }}
                  transition={
                    lang
                      ? { delay: reduce ? 0 : 0.45, duration: reduce ? 0.2 : 0.55, ease: [0.55, 0, 1, 0.45], opacity: { delay: reduce ? 0 : 0.75, duration: 0.25 } }
                      : reduce
                      ? { duration: 0.3 }
                      : {
                          left: spring,
                          top: spring,
                          scale: spring,
                          rotate: { type: 'spring', stiffness: 60, damping: 13 },
                          opacity: { duration: 0.3 },
                        }
                  }
                >
                  {/* the box slides in from the right as the reader scrolls (screen 3's scroll clock) */}
                  <motion.div className="absolute inset-0" style={{ x: freshX }}>
                  {/* soft contact shadow */}
                  <span aria-hidden="true" className="absolute -bottom-10 left-1/2 h-7 w-[86%] -translate-x-1/2 rounded-[50%] bg-black/20 blur-xl" />

                  {/* box base: a white tray with a gentle inner shadow (set aside on screen 4) */}
                  <motion.div
                    aria-hidden="true"
                    className="absolute -inset-[16px] rounded-[3rem] bg-white"
                    style={{
                      boxShadow:
                        '0 40px 80px -36px rgba(10,11,16,0.35), 0 0 0 1px rgba(10,11,16,0.05), inset 0 12px 26px rgba(10,11,16,0.07), inset 0 -6px 14px rgba(10,11,16,0.04)',
                    }}
                    initial={false}
                    animate={syncing ? { x: -1500, opacity: 0 } : { x: 0, opacity: 1 }}
                    transition={{ duration: 0.8 * k, ease: [0.5, 0, 0.75, 0] }}
                  />

                  {/* the new phone, resting in the tray */}
                  <div className="relative">
                    <ManifestoPhone
                      progress={still}
                      reduce
                      initialTab="messages"
                      messagesOnly
                      liveThread={newMsg ? ISHA_WITH_NEW : restoring ? ISHA_SENDS : NOTHING_YET}
                      liveDelay={0}
                      liveSpeed={freshDirect || instant ? 0.01 : 0.28}
                      contactName="Rohan"
                      contactPhoto="/media/profile-demo/profile-male-1.jpg"
                      ownerName="Isha"
                      ownerAge={27}
                      ownerPhoto="/media/profile-demo/profile-1.jpg"
                      className="relative isolate"
                    />
                    {/* the key lands: a soft pulse of light on the glass */}
                    <motion.span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[11px] rounded-[2.25rem]"
                      style={{ boxShadow: `0 0 0 2px ${PINK}, 0 0 40px 6px rgba(255,143,199,0.55)`, opacity: keyGlow }}
                    />
                  </div>

                  {/* lid: slides down off the box and out of view, passing behind the text */}
                  <motion.div
                    aria-hidden="true"
                    className="absolute -inset-[18px] rounded-[3.1rem]"
                    // Far enough to leave any window: the canvas is scaled down a lot on phones, so a short
                    // slide could stop mid-screen. It travels ~4000 canvas px (several screen heights at
                    // any scale) and fades out on the way, so it never lingers.
                    style={{
                      background: 'linear-gradient(180deg, #FFFFFF 0%, #F6F6F4 55%, #EFEFEC 100%)',
                      boxShadow: '0 30px 70px -34px rgba(10,11,16,0.4), 0 0 0 1px rgba(10,11,16,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
                      y: lidY,
                      opacity: lidOpacity,
                    }}
                  >
                    {/* a faint sheen across the lid, like a matte paper box */}
                    <span
                      className="absolute inset-0 rounded-[3.1rem]"
                      style={{ background: 'linear-gradient(120deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.75) 45%, rgba(255,255,255,0) 60%)' }}
                    />
                  </motion.div>

                  {/* restored — under the phone, tilted with it */}
                  <motion.span
                    className="absolute -bottom-12 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12px] font-semibold text-white shadow-lg"
                    style={{ background: '#16a34a' }}
                    initial={{ opacity: 0, scale: 0.6, y: -8 }}
                    animate={badgeOn ? { opacity: 1, scale: 1, y: 0 } : syncing ? { opacity: 0, scale: 0.8, y: -8 } : { opacity: 0, scale: 0.6, y: -8 }}
                    transition={badgeOn ? { type: 'spring', stiffness: 260, damping: 15 } : { duration: 0.3 }}
                  >
                    <Check className="h-3.5 w-3.5" /> Every message back
                  </motion.span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      }}
    </FitCanvas>
  );
}

/**
 * Every caption language OneHook offers across devices — the union of the web app's in-call menu
 * (InCallScreen CAPTION_LANGUAGES), iOS (adds Russian) and Android (Indian languages). Whether a
 * given pair translates is decided by each device's on-device engine, hence the ✱.
 */
const CAPTION_LANGS: { native: string; english: string; rtl?: boolean }[] = [
  { native: 'हिन्दी', english: 'Hindi' },
  { native: 'বাংলা', english: 'Bengali' },
  { native: 'தமிழ்', english: 'Tamil' },
  { native: 'తెలుగు', english: 'Telugu' },
  { native: 'मराठी', english: 'Marathi' },
  { native: 'ગુજરાતી', english: 'Gujarati' },
  { native: 'ಕನ್ನಡ', english: 'Kannada' },
  { native: 'اردو', english: 'Urdu', rtl: true },
  { native: 'English', english: 'English' },
  { native: 'Español', english: 'Spanish' },
  { native: 'Français', english: 'French' },
  { native: 'Deutsch', english: 'German' },
  { native: 'Português', english: 'Portuguese' },
  { native: 'Русский', english: 'Russian' },
  { native: 'العربية', english: 'Arabic', rtl: true },
  { native: '中文', english: 'Chinese' },
  { native: '日本語', english: 'Japanese' },
];

/** Caption pairs: what was said (top) and what you read (bottom). Mostly Indian languages. */
const CAPTION_PAIRS: { from: string; to: string; said: string; read: string; rtl?: boolean }[] = [
  { from: 'हिन्दी', to: 'English', said: 'कल शाम मिलते हैं?', read: 'Shall we meet tomorrow evening?' },
  { from: 'தமிழ்', to: 'English', said: 'நீ ரொம்ப அழகா சிரிக்கிற', read: 'You have such a lovely smile' },
  { from: 'বাংলা', to: 'हिन्दी', said: 'আজ রাতে ফোন করবে?', read: 'आज रात फ़ोन करोगे?' },
  { from: 'తెలుగు', to: 'English', said: 'నువ్వు భోజనం చేశావా?', read: 'Have you eaten?' },
  { from: 'मराठी', to: 'English', said: 'मला तुझी आठवण येते', read: 'I miss you' },
  { from: 'Español', to: 'हिन्दी', said: '¡Me encantó la cena!', read: 'मुझे डिनर बहुत पसंद आया!' },
  { from: 'ગુજરાતી', to: 'हिन्दी', said: 'ચાલો ફરવા જઈએ', read: 'चलो घूमने चलें' },
  { from: 'ಕನ್ನಡ', to: 'English', said: 'ನಾಳೆ ಸಿಗೋಣ', read: 'See you tomorrow' },
  { from: 'Français', to: 'தமிழ்', said: 'Tu me manques', read: 'உன்னை மிஸ் பண்றேன்' },
  { from: 'اردو', to: 'English', said: 'تم بہت یاد آتے ہو', read: 'I miss you so much', rtl: true },
  { from: '日本語', to: 'English', said: 'また会いたい', read: 'I want to see you again' },
  { from: 'العربية', to: 'हिन्दी', said: 'تصبح على خير', read: 'शुभ रात्रि', rtl: true },
];

/** One caption card: the original line on top, the translation below — nothing swaps. */
function CaptionCard({ pair, i, reduce }: { pair: (typeof CAPTION_PAIRS)[number]; i: number; reduce: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={reduce ? { opacity: 1, y: 0 } : { opacity: 1, y: [0, -4, 0] }}
      transition={
        reduce
          ? { delay: i * 0.05, duration: 0.3 }
          : { opacity: { delay: i * 0.08, duration: 0.45 }, y: { delay: i * 0.08, duration: 4 + (i % 3), repeat: Infinity, ease: 'easeInOut' } }
      }
      className="rounded-2xl border border-black/[0.07] bg-white p-3.5 text-left shadow-[0_18px_40px_-28px_rgba(10,11,16,0.45)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-black/40">
          {pair.from} <span className="text-black/25">→</span> {pair.to}
        </span>
        <span className="flex items-end gap-[2px]" aria-hidden="true">
          {[0, 1, 2, 3].map((b) => (
            <motion.span
              key={b}
              className="w-[2px] rounded-full bg-accent/50"
              animate={reduce ? { height: 6 } : { height: [3, 9 - (b % 2) * 3, 3] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: b * 0.12 + i * 0.05 }}
            />
          ))}
        </span>
      </div>
      <p dir={pair.rtl ? 'rtl' : undefined} className="mt-2 text-[13px] text-black/50">
        {pair.said}
      </p>
      <p className="mt-1 text-[15px] font-medium leading-snug text-text">{pair.read}</p>
    </motion.div>
  );
}

/** The main live-caption window — the same waveform bars and original-over-translation as before. */
function CaptionMain() {
  const reduce = useReducedMotion();
  return (
    <div className="w-[360px] rounded-[2rem] border border-black/10 bg-white p-6 shadow-[0_40px_90px_-40px_rgba(10,11,16,0.55)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-text/80">Call with Kabir · live captions</span>
        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.18em] text-[#16a34a]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" /> On device
        </span>
      </div>
      <div className="mt-5 flex h-12 items-center justify-center gap-1" aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => (
          <motion.span
            key={i}
            className="w-1 rounded-full bg-accent/70"
            animate={reduce ? { height: 10 } : { height: [6, 10 + ((i * 7) % 30), 6] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.04, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <p className="mt-5 text-center text-[16px] text-black/45">कल शाम मिलते हैं? 🇮🇳</p>
      <p className="mt-1.5 text-center text-[20px] font-medium leading-snug text-text">Shall we meet tomorrow evening? 💬</p>
    </div>
  );
}

/**
 * Screen 5 burst: the main caption window sits where the phone fell; translation boxes spring out of
 * it on widening rings and cover the whole space — big near the centre, smaller further out.
 */
/** One translation box springing out of the main window, read off screen 5's scroll clock. */
function BurstBox({ b, cx, cy, clock, reduce }: { b: { x: number; y: number; s: number; delay: number; blurred: boolean; pair: (typeof CAPTION_PAIRS)[number]; i: number }; cx: number; cy: number; clock: MotionValue<number>; reduce: boolean }) {
  const d = b.delay + 0.1; // after the window (from PHONE_GONE − 0.1 s) has grown into place
  const left = useTransform(clock, [d, d + 0.45, d + 0.65], [cx, b.x + (b.x - cx) * 0.04, b.x]);
  const top = useTransform(clock, [d, d + 0.45, d + 0.65], [cy, b.y + (b.y - cy) * 0.04, b.y]);
  const scale = useTransform(clock, [d, d + 0.45, d + 0.65], [0.2, b.s * 1.04, b.s]);
  const opacity = useTransform(clock, [d, d + 0.3], [0, b.blurred ? 0.35 : 1]);
  return (
    <motion.div
      className="absolute w-[230px] -translate-x-1/2 -translate-y-1/2"
      style={{ left, top, scale, opacity, ...(b.blurred ? { filter: 'blur(6px)' } : {}) }}
    >
      <CaptionCard pair={b.pair} i={b.i} reduce={reduce} />
    </motion.div>
  );
}

function TranslationBurst({ layout, handoff }: { layout: 'land' | 'port'; handoff: boolean }) {
  const reduce = useReducedMotion() ?? false;
  // Arriving from screen 4 the devices gather into the phone, then it drops and shrinks away on a fixed
  // ~1 s timer. The window IS that phone becoming a caption window, so it grows on the same timer, right
  // as the phone vanishes. The boxes after it are scrubbed by scroll, but held back so they can never
  // overtake the phone either.
  const [fromPhone] = useState(handoff);
  const since = useSinceMount(fromPhone && !reduce);
  const scrollClock = useSceneClock(SCENE_LANG, SCENE_SECONDS[SCENE_LANG]);
  const clock = useHandoffClock(scrollClock, since);
  const windowClock = fromPhone && !reduce ? since : scrollClock;
  // the window grows out of the spot where the phone vanished (it dropped 70 px, tilted 10°)
  const w0 = PHONE_GONE - 0.1;
  const mainOpacity = useTransform(windowClock, [w0, w0 + 0.2], [0, 1]);
  const mainScale = useTransform(windowClock, [w0, w0 + 0.35, w0 + 0.55], [0.35, 1.04, 1]);
  const mainY = useTransform(windowClock, [w0, w0 + 0.45], [70, 0]);
  const mainRotate = useTransform(windowClock, [w0, w0 + 0.45], [10, 0]);
  const land = layout === 'land';
  const W = land ? LAYOUTS.land.w : LAYOUTS.port.w;
  const H = land ? LAYOUTS.land.h : LAYOUTS.port.h;
  const cx = W / 2;
  const cy = H / 2;
  const rings = land
    ? [
        { n: 6, rx: 360, ry: 190, s: 0.86 },
        { n: 10, rx: 610, ry: 330, s: 0.64 },
        { n: 16, rx: 880, ry: 470, s: 0.46 },
      ]
    : [
        { n: 4, rx: 150, ry: 330, s: 0.72 },
        { n: 8, rx: 260, ry: 590, s: 0.54 },
        { n: 12, rx: 380, ry: 860, s: 0.4 },
      ];
  let idx = 0;
  const boxes = rings.flatMap((r, ri) =>
    Array.from({ length: r.n }, (_, j) => {
      const a = (j / r.n) * Math.PI * 2 + ri * 0.45;
      const box = {
        x: cx + r.rx * Math.cos(a),
        y: cy + r.ry * Math.sin(a),
        s: r.s,
        delay: 1.15 + ri * 0.35 + j * 0.035,
        pair: CAPTION_PAIRS[idx % CAPTION_PAIRS.length],
        i: idx,
      };
      idx += 1;
      return box;
    })
  );

  // The headline + buttons sit just below the canvas, centred (full width in portrait). Boxes whose
  // centre would land behind them are dropped; ones that only reach into that zone are blurred, so
  // the copy only fills the empty borders around the text.
  const textHalf = land ? 360 : Number.POSITIVE_INFINITY; // half the text block's width, canvas units
  const BOX_HALF_W = 115;
  const BOX_HALF_H = 58;
  const behindText = (x: number, y: number, s: number) =>
    y + BOX_HALF_H * s > H - 6 && Math.abs(x - cx) < textHalf + BOX_HALF_W * s;
  const visibleBoxes = boxes
    .filter((b) => !(b.y > H - 6 && Math.abs(b.x - cx) < textHalf))
    .map((b) => ({ ...b, blurred: behindText(b.x, b.y, b.s) }));

  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
      {/* the copies, springing out of the main window (outer rings first in paint order, so nearer
          boxes sit on top) */}
      {[...visibleBoxes].reverse().map((b) => (
        <Fragment key={b.i}>
          <BurstBox b={b} cx={cx} cy={cy} clock={clock} reduce={reduce} />
        </Fragment>
      ))}

      {/* the main window — what the phone became */}
      <motion.div
        className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ left: cx, top: cy, opacity: mainOpacity, scale: mainScale, y: mainY, rotate: mainRotate }}
      >
        <CaptionMain />
      </motion.div>
    </motion.div>
  );
}

/**
 * The supported-language list, rolling the full height of the screen on the right. It sits in front of
 * the caption boxes, and turns see-through where it would run behind the headline and buttons.
 */
function LanguageRail({ handoff }: { handoff: boolean }) {
  const reduce = useReducedMotion() ?? false;
  const [fromPhone] = useState(handoff);
  const clock = useHandoffClock(useSceneClock(SCENE_LANG, SCENE_SECONDS[SCENE_LANG]), useSinceMount(fromPhone && !reduce));
  // slides in with the boxes, once the phone has gone and the window is in place
  const railOpacity = useTransform(clock, [PHONE_GONE + 0.25, PHONE_GONE + 0.85], [0, 1]);
  const railX = useTransform(clock, [PHONE_GONE + 0.25, PHONE_GONE + 0.85], [40, 0]);
  const list = [...CAPTION_LANGS, ...CAPTION_LANGS]; // doubled for a seamless loop
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 z-[5] flex w-[42%] max-w-[320px] flex-col border-l border-black/[0.06] bg-[#FAFAF8]/85 backdrop-blur-md sm:w-[30%]"
      style={{
        WebkitMaskImage: 'linear-gradient(to bottom, #000 0, #000 calc(100% - 300px), rgba(0,0,0,0.28) calc(100% - 220px), rgba(0,0,0,0.28) 100%)',
        maskImage: 'linear-gradient(to bottom, #000 0, #000 calc(100% - 300px), rgba(0,0,0,0.28) calc(100% - 220px), rgba(0,0,0,0.28) 100%)',
        opacity: railOpacity,
        x: railX,
      }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      <div className="px-5 pb-2 pt-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-black/45">Supported languages ✱</p>
        <p className="mt-1.5 text-[10px] leading-relaxed text-black/45">✱ Based on your device’s capability — translation runs on your device, so available pairs vary by phone and browser.</p>
      </div>
      <div
        className="relative flex-1 overflow-hidden"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 8%, #000 92%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 8%, #000 92%, transparent 100%)',
        }}
      >
        <motion.ul className="px-5" animate={reduce ? undefined : { y: ['0%', '-50%'] }} transition={reduce ? undefined : { duration: 30, repeat: Infinity, ease: 'linear' }}>
          {list.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 border-b border-black/[0.05] py-3.5">
              <span dir={l.rtl ? 'rtl' : undefined} className="font-serif text-2xl italic text-text sm:text-3xl">
                {l.native}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/40">{l.english}</span>
            </li>
          ))}
        </motion.ul>
      </div>
    </motion.div>
  );
}

/**
 * Mr OneHook, as in the Science route — but told as a messenger feature: on your phone the chat is
 * decrypted, you tick the only lines he may see, exactly those leave your phone (nothing stored), and
 * his reply comes back at the bottom. The full Mr OneHook (with his Understanding / Privacy / AI
 * Insights / Encrypted ring) sits in the centre.
 */
const MR_MESSAGES = [
  { from: 'Rohan', text: 'You’ve been quiet all evening. Everything okay?', pick: false },
  { from: 'You', text: 'I don’t know how to say this…', pick: true },
  { from: 'You', text: 'Work has been a lot lately.', pick: false },
  { from: 'You', text: 'I miss how we used to talk.', pick: true },
] as const;

// Brushed silver, toned down a step so it still reads on the light page.
const SILVER_LINE_H = 'linear-gradient(90deg, #7F8792, #B9BFC8 50%, #7F8792)';
const SILVER_LINE_V = 'linear-gradient(180deg, #7F8792, #B9BFC8 50%, #7F8792)';

/** Scene index of the Mr OneHook screen (its choreography is scrubbed by scroll). */
const SCENE_MR = 5;
/** Length of the Mr OneHook choreography in seconds, mapped onto its scroll band. */
const MR_SECONDS = 3.2;

function MrMessage({ m, i, p, t }: { m: (typeof MR_MESSAGES)[number]; i: number; p: MotionValue<number>; t: (a: number, b: number) => [number, number] }) {
  // the line arrives (was: delay i*0.12s), then picked lines get ticked and ringed in pink while the
  // others fade back (was: 0.8 + i*0.25s)
  const [a0, a1] = t(i * 0.12, i * 0.12 + 0.35);
  const opacity = useTransform(p, [a0, a1], [0, 1]);
  const y = useTransform(p, [a0, a1], [8, 0]);
  const [b0, b1] = t(0.8 + i * 0.25, 0.8 + i * 0.25 + 0.3);
  const tickBg = useTransform(p, [b0, b1], ['rgba(255,255,255,1)', m.pick ? 'rgba(31,58,107,1)' : 'rgba(255,255,255,1)']);
  const tickBorder = useTransform(p, [b0, b1], ['rgba(10,11,16,0.25)', m.pick ? 'rgba(31,58,107,1)' : 'rgba(10,11,16,0.25)']);
  const [c0, c1] = t(0.85 + i * 0.25, 0.85 + i * 0.25 + 0.3);
  const checkScale = useTransform(p, [c0, c0 + (c1 - c0) * 0.7, c1], [0, 1.15, 1]);
  const ring = useTransform(
    p,
    [b0, b1],
    m.pick
      ? ['0 0 0 0px rgba(255,255,255,0), 0 0 0 0px rgba(255,143,199,0)', '0 0 0 2px rgba(255,255,255,1), 0 0 0 3.5px rgba(255,143,199,1)']
      : ['0 0 0 0px rgba(255,255,255,0), 0 0 0 0px rgba(255,143,199,0)', '0 0 0 0px rgba(255,255,255,0), 0 0 0 0px rgba(255,143,199,0)']
  );
  const bubbleOpacity = useTransform(p, [b0, b1], [1, m.pick ? 1 : 0.55]);
  return (
    <motion.li style={{ opacity, y }} className={`flex items-start gap-2.5 ${m.from === 'You' ? 'flex-row-reverse text-right' : ''}`}>
      <motion.span
        aria-hidden="true"
        className="mt-2.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border"
        style={{ backgroundColor: tickBg, borderColor: tickBorder }}
      >
        {m.pick && (
          <motion.span style={{ scale: checkScale }}>
            <Check className="h-2.5 w-2.5 text-white" />
          </motion.span>
        )}
      </motion.span>
      <motion.span
        className={`rounded-2xl px-3.5 py-2 text-[13px] font-light leading-snug ${m.from === 'You' ? 'text-white' : 'bg-black/[0.04] text-text'}`}
        style={{ ...(m.from === 'You' ? { background: '#1F3A6B' } : {}), boxShadow: ring, opacity: bubbleOpacity }}
      >
        {m.text}
      </motion.span>
    </motion.li>
  );
}

function SceneMrOneHook() {
  const instant = useStoryInstant();
  const reduce = useReducedMotion() ?? false;
  const k = reduce ? 0.3 : 1;
  const p = useSceneProgress(SCENE_MR);
  const { t } = useTimeline(MR_SECONDS);
  const [pay0, pay1] = t(1.4, 1.9);
  const payloadOpacity = useTransform(p, [pay0, pay1], [0, 1]);
  // the reply follows the payload straight away (it used to wait until 2.6 s, leaving a dead gap), and
  // lands before the pink brush stroke behind the screen has finished its sweep
  const [rep0, rep1] = t(1.7, 2.2);
  const replyOpacity = useTransform(p, [rep0, rep1], [0, 1]);
  const replyY = useTransform(p, [rep0, rep1], [14, 0]);
  const picked = MR_MESSAGES.filter((m) => m.pick);
  const payload = JSON.stringify(
    { excerpts: picked.map((m) => ({ from: m.from === 'You' ? 'you' : 'them', text: m.text })), stored: false },
    null,
    2
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] px-2">
      <div className="grid items-stretch gap-3 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_380px_minmax(0,1fr)] lg:gap-6">
        {/* left · on your phone, decrypted — you tick what he may see */}
        <div className="flex h-full flex-col rounded-[28px] border border-black/[0.07] bg-white p-4 shadow-[0_30px_80px_-50px_rgba(10,11,16,0.35)] sm:p-6 lg:min-h-[300px]">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-black/40">On your phone · decrypted</p>
          <ul className="mt-5 space-y-2.5">
            {MR_MESSAGES.map((m, i) => (
              <Fragment key={i}>
                <MrMessage m={m} i={i} p={p} t={t} />
              </Fragment>
            ))}
          </ul>
          <p className="mt-auto flex items-center justify-center gap-1.5 pt-4 text-[10px] text-black/40">
            <EyeOff className="h-3 w-3" /> Unticked lines never leave your phone
          </p>
        </div>

        {/* centre · Mr OneHook, in full */}
        <div className="relative flex min-h-[150px] flex-col items-center justify-center gap-3 lg:min-h-[300px]">
          {/* brushed-silver links from each card to Mr OneHook — horizontal when the three sit side by
              side, vertical when they stack. Each is two segments that stop short of him (so nothing runs
              through his face), with the ticked lines travelling along them as pink dots. */}
          <div aria-hidden="true" className="pointer-events-none absolute -inset-x-6 top-1/2 hidden -translate-y-1/2 items-center lg:flex">
            <span className="block h-[2px] flex-1 rounded-full" style={{ background: SILVER_LINE_H }} />
            <span className="w-[150px] shrink-0" />
            <span className="block h-[2px] flex-1 rounded-full" style={{ background: SILVER_LINE_H }} />
            {[0, 1].map((d) => (
              <motion.span
                key={d}
                className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                style={{ background: PINK }}
                initial={{ left: '0%', opacity: 0 }}
                animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
                transition={{ delay: (1.6 + d * 0.35) * k, duration: 1.3, repeat: Infinity, repeatDelay: 1.4 }}
              />
            ))}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -inset-y-6 left-1/2 flex w-2 -translate-x-1/2 flex-col items-center lg:hidden">
            <span className="block w-[3px] min-w-[3px] flex-1 rounded-full" style={{ background: SILVER_LINE_V }} />
            <span className="h-[170px] shrink-0" />
            <span className="block w-[3px] min-w-[3px] flex-1 rounded-full" style={{ background: SILVER_LINE_V }} />
            {[0, 1].map((d) => (
              <motion.span
                key={d}
                className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
                style={{ background: PINK }}
                initial={{ top: '0%', opacity: 0 }}
                animate={{ top: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
                transition={{ delay: (1.6 + d * 0.35) * k, duration: 1.3, repeat: Infinity, repeatDelay: 1.4 }}
              />
            ))}
          </div>
          <div className="relative z-[1] flex flex-col items-center gap-3">
            {/* shown finished (revisit / scrolling up): the ring is already there, no pop-in */}
            <AlienScanner size={108} hideTooltips settled={instant} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-black/40">Mr OneHook</p>
          </div>
        </div>

        {/* right · exactly what leaves your phone */}
        <div className="flex h-full flex-col rounded-[28px] p-4 font-mono text-[11px] text-white/80 sm:p-6 sm:text-[12px] lg:min-h-[300px]" style={{ background: INK }}>
          <p className="mb-4 text-center font-sans text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">What leaves your phone</p>
          <motion.pre className="whitespace-pre-wrap leading-relaxed" style={{ opacity: payloadOpacity }}>
            {payload}
          </motion.pre>
          <p className="mt-auto pt-4 font-sans text-[10px] leading-relaxed text-white/45">Used for this one reply, then forgotten — never stored, never logged.</p>
        </div>
      </div>

      {/* bottom · what Mr OneHook sends back */}
      <motion.div
        style={{ opacity: replyOpacity, y: replyY }}
        className="mx-auto mt-3 flex max-w-3xl items-start gap-3 rounded-[24px] border border-[#ff8fc7]/40 bg-white p-4 text-left shadow-[0_24px_60px_-40px_rgba(255,105,180,0.6)] sm:mt-6 sm:gap-4 sm:p-5"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(255,143,199,0.15)' }}>
          <Heart className="h-4 w-4" style={{ color: PINK }} fill={PINK} />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-black/40">From Mr OneHook</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-text">
            It sounds like you’re missing closeness, not just conversation. You could start with: <em>“I miss our talks — can we take a walk tonight, just us?”</em> 💛
          </p>
          <div className="mt-3 hidden flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] sm:flex">
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-black/55">Suggested reply</span>
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-black/55">Date idea · an evening walk</span>
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-black/55">You decide what to send</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Screen 6: Mr OneHook peeking in from the screen edges, Kiro-Crew style — big heads cut off by the
 * edges plus a couple of small Mr OneHooks floating free. Each edge one is turned so its head points
 * into the screen (upside-down from the top, sideways from the sides, upright from the bottom), so
 * the face and eyes show while the rest stays behind the edge. They pop in one by one with a soft
 * spring, then sway gently; the mascot's own eyes follow the cursor and its hand waves.
 */
type PeekDef =
  | { kind: 'edge'; edge: 'top' | 'bottom' | 'left' | 'right'; at: string; size: number; delay: number; tilt: number }
  | { kind: 'float'; x: string; y: string; size: number; delay: number; tilt: number };

const PEEKS: PeekDef[] = [
  { kind: 'edge', edge: 'top', at: '21%', size: 170, delay: 0.1, tilt: -6 },
  { kind: 'edge', edge: 'top', at: '70%', size: 200, delay: 0.35, tilt: 8 },
  { kind: 'edge', edge: 'left', at: '40%', size: 190, delay: 0.55, tilt: 4 },
  { kind: 'edge', edge: 'right', at: '58%', size: 220, delay: 0.75, tilt: -4 },
  { kind: 'edge', edge: 'bottom', at: '13%', size: 280, delay: 0.95, tilt: 3 },
  { kind: 'float', x: '86%', y: '18%', size: 96, delay: 1.25, tilt: 8 },
  { kind: 'float', x: '11%', y: '70%', size: 116, delay: 1.5, tilt: -8 },
];

/** One peeking Mr OneHook's pop-in, scrubbed by the screen's scroll progress. */
function usePeekIn(delay: number, duration = 0.6) {
  const p = useSceneProgress(SCENE_MR);
  const { t } = useTimeline(MR_SECONDS);
  const [a, b] = t(delay, delay + duration);
  return { p, a, b, mid: a + (b - a) * 0.7 };
}

function FloatPeek({ peek, size, i, reduce, lite }: { peek: Extract<PeekDef, { kind: 'float' }>; size: number; i: number; reduce: boolean; lite: boolean }) {
  const { p, a, b, mid } = usePeekIn(peek.delay);
  const scale = useTransform(p, [a, mid, b], [0, 1.08, 1]);
  const opacity = useTransform(p, [a, a + (b - a) * 0.4], [0, 1]);
  return (
    <div className="absolute" style={{ left: peek.x, top: peek.y }}>
      <motion.div className="-translate-x-1/2 -translate-y-1/2" style={{ scale, opacity }}>
        {/* ambient sway keeps running on its own */}
        <motion.div
          animate={reduce || lite ? { rotate: peek.tilt } : { y: [0, -9, 0], rotate: [peek.tilt - 3, peek.tilt + 3, peek.tilt - 3] }}
          transition={reduce || lite ? { duration: 0 } : { duration: 4.5 + (i % 2), repeat: Infinity, ease: 'easeInOut' }}
        >
          <AlienScanner size={size} hideTooltips bare />
        </motion.div>
      </motion.div>
    </div>
  );
}

function EdgePeek({ peek, size, i, reduce, lite }: { peek: Extract<PeekDef, { kind: 'edge' }>; size: number; i: number; reduce: boolean; lite: boolean }) {
  const { p, a, b, mid } = usePeekIn(peek.delay, 0.8);
  // In the mascot's own frame (head up), the screen edge sits `inside` below its centre: the head
  // down to just under the smile shows, the body, arms and feet stay hidden.
  const inside = size * 0.13;
  const hidden = -size * 0.62;
  const y = useTransform(p, [a, mid, b], [-hidden, -inside - size * 0.04, -inside]);
  const turn = { top: 180, bottom: 0, left: 90, right: -90 } as const;
  const anchor: CSSProperties =
    peek.edge === 'top'
      ? { left: peek.at, top: 0 }
      : peek.edge === 'bottom'
        ? { left: peek.at, top: '100%' }
        : peek.edge === 'left'
          ? { left: 0, top: peek.at }
          : { left: '100%', top: peek.at };
  return (
    <div className="absolute h-0 w-0" style={anchor}>
      {/* turn so "up" for the mascot points into the screen */}
      <div style={{ transform: `rotate(${turn[peek.edge]}deg)` }}>
        <motion.div className="absolute" style={{ width: size, height: size, left: -size / 2, top: -size / 2, y }}>
          <motion.div
            style={{ transformOrigin: '50% 100%' }}
            animate={reduce || lite ? { rotate: peek.tilt } : { rotate: [peek.tilt - 3, peek.tilt + 3, peek.tilt - 3] }}
            transition={reduce || lite ? { duration: 0 } : { duration: 5 + (i % 3), repeat: Infinity, ease: 'easeInOut', delay: peek.delay + 0.6 }}
          >
            <AlienScanner size={size} hideTooltips bare />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

function MascotPeeks() {
  const lite = useLite();
  const reduce = useReducedMotion() ?? false;
  const [scale, setScale] = useState(() => (typeof window === 'undefined' ? 1 : Math.min(1, window.innerWidth / 1280)));
  useEffect(() => {
    const onResize = () => setScale(Math.min(1, window.innerWidth / 1280));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      {/* lighter mode (phones): four of the seven — incl. the one peeking in from the left, just above centre */}
      {(lite ? PEEKS.filter((_, i) => i === 1 || i === 2 || i === 3 || i === 4) : PEEKS).map((p, i) => {
        const size = Math.round(Math.max(70, p.size * (0.6 + 0.4 * scale)));
        return (
          <Fragment key={i}>
            {p.kind === 'float' ? (
              <FloatPeek peek={p} size={size} i={i} reduce={reduce} lite={lite} />
            ) : (
              <EdgePeek peek={p} size={size} i={i} reduce={reduce} lite={lite} />
            )}
          </Fragment>
        );
      })}
    </motion.div>
  );
}

/**
 * The landing page's pink paint-stroke accent (same five layered strands, widths, offsets and fade),
 * drawn as one S-curve sweeping across the screen behind screen 6.
 */
function PinkStrokes() {
  const p = useSceneProgress(SCENE_MR);
  const { t } = useTimeline(MR_SECONDS);
  // sweeps the whole time the story plays out, finishing just after Mr OneHook's reply lands (2.2 s)
  const [w0, w1] = t(0, 2.4);
  const revealWidth = useTransform(p, [w0, w1], [0, 1600]);
  // One line: it draws in from off-screen left, sweeps across and leaves past the right edge — then
  // simply stays there, still.
  const PATH = 'M -90 420 C 240 470, 500 390, 440 280 C 380 170, 560 85, 740 170 C 880 235, 950 330, 1160 300';
  // Tight bundle: the strands sit almost on top of each other so they read as one brush stroke all
  // the way along, instead of fanning apart and pinching together on the bends.
  const strands = [
    { w: 8, o: 0.6, t: 'translate(-2.5, -1.5)' },
    { w: 12, o: 0.8, t: 'translate(-1.2, 1)' },
    { w: 16, o: 1, t: 'translate(0, 0)' },
    { w: 10, o: 0.7, t: 'translate(1.5, -1)' },
    { w: 14, o: 0.5, t: 'translate(2.5, 1.5)' },
  ];
  return (
    <motion.svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      {/* The stroke is always the full, solid line; a clip sweeping left → right reveals it. (Using
          pathLength dashes here breaks with vector-effect="non-scaling-stroke" and leaves a gap.) */}
      <defs>
        <clipPath id="msg-pink-reveal">
          <motion.rect x={-200} y={-200} height={1000} style={{ width: revealWidth }} />
        </clipPath>
      </defs>
      <g opacity={0.55} clipPath="url(#msg-pink-reveal)">
        {strands.map((st, i) => (
          <path
            key={i}
            d={PATH}
            fill="none"
            stroke="#ff69b4"
            strokeWidth={st.w}
            strokeLinecap="round"
            opacity={st.o}
            transform={st.t}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </motion.svg>
  );
}

/** Scene indexes of the screens that drive their own choreography from scroll. */
const SCENE_SEALED = 6;

/**
 * Screen 7's second wave: once the four memories are sealed, more of the messenger loads in the
 * background around them. Every tile is a real capability (see the file header): reactions are stored
 * as ciphertext, calls carry the 4-emoji safety code, screen sharing needs the other person to accept,
 * disappearing messages expire on the server, deletes fan out to both phones, and read receipts /
 * typing / last seen are privacy settings. Those last ones are controls, not encryption, so they get
 * a switch badge instead of a lock.
 */
type Feature = { Icon: typeof ImageIcon; title: string; sub: string; badge: 'lock' | 'switch' };
const SEALED_FEATURES: Feature[] = [
  { Icon: Phone, title: 'Voice calls', sub: 'Encrypted end to end', badge: 'lock' },
  { Icon: SmilePlus, title: 'Reactions', sub: 'Even the emoji is sealed', badge: 'lock' },
  { Icon: Video, title: 'Video calls', sub: 'Face to face, sealed', badge: 'lock' },
  { Icon: Timer, title: 'Disappearing', sub: 'Gone when the timer ends', badge: 'lock' },
  { Icon: Reply, title: 'Replies', sub: 'Quote any message', badge: 'lock' },
  { Icon: ScreenShare, title: 'Screen sharing', sub: 'Only if they accept', badge: 'lock' },
  { Icon: ShieldCheck, title: 'Safety code', sub: '4 emoji verify every call', badge: 'lock' },
  { Icon: Trash2, title: 'Delete for both', sub: 'Gone from both phones', badge: 'switch' },
  { Icon: CheckCheck, title: 'Read receipts', sub: 'On or off, your call', badge: 'switch' },
  { Icon: MessageCircleMore, title: 'Typing & last seen', sub: 'Show it, or don’t', badge: 'switch' },
];
/** The four memories finish sealing at 1.8 s; the background starts loading just after. */
const FEATURES_FROM = 1.95;
const FEATURE_STAGGER = 0.14;
/** Side-column geometry (canvas px, before FitBox scaling). */
const FEATURE_W = 136;
const FEATURE_GAP = 24;
/** Where the side tiles sit, in load order: inner columns first, alternating sides, top to bottom. */
const FEATURE_SPOTS: { side: 'left' | 'right'; col: 0 | 1; top: string }[] = [
  { side: 'left', col: 0, top: '14%' },
  { side: 'right', col: 0, top: '14%' },
  { side: 'left', col: 0, top: '50%' },
  { side: 'right', col: 0, top: '50%' },
  { side: 'left', col: 0, top: '86%' },
  { side: 'right', col: 0, top: '86%' },
  { side: 'left', col: 1, top: '30%' },
  { side: 'right', col: 1, top: '30%' },
  { side: 'left', col: 1, top: '70%' },
  { side: 'right', col: 1, top: '70%' },
];

/**
 * How many side columns fit beside the 420 px grid: 2 on wide screens, 1 on laptops/tablets, 0 on
 * phones (the tiles become a row of chips under the grid). Read from the window width only, so the
 * choice never feeds back into FitBox's scaling.
 */
function featureColumns(): 0 | 1 | 2 {
  if (typeof window === 'undefined') return 2;
  const grid = Math.min(420, window.innerWidth - 48);
  const side = (window.innerWidth - grid) / 2 - 40; // keep clear of the story thread on the right
  return side >= 2 * (FEATURE_W + FEATURE_GAP) ? 2 : side >= FEATURE_W + FEATURE_GAP ? 1 : 0;
}

function useFeatureColumns() {
  const [cols, setCols] = useState(featureColumns);
  useEffect(() => {
    const onResize = () => setCols(featureColumns());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
}

/** Photo, video, voice note, file — each gets stamped with the same lock, scrubbed by scroll. Then
 *  more of the messenger loads in the background around them. */
function SceneSealed() {
  const p = useSceneProgress(SCENE_SEALED);
  const { t } = useTimeline(SCENE_SECONDS[SCENE_SEALED]);
  const cols = useFeatureColumns();
  const items = [ImageIcon, Video, Mic, FileText];
  const spots = FEATURE_SPOTS.filter((s) => s.col < cols);
  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative w-full max-w-[420px]">
        {/* the background wave, beside the grid (behind it in paint order) */}
        {spots.map((spot, k) => (
          <Fragment key={k}>
            <FeatureTile f={SEALED_FEATURES[k]} k={k} p={p} t={t} spot={spot} />
          </Fragment>
        ))}
        <div className="relative z-10 grid w-full grid-cols-2 gap-4">
          {items.map((Icon, i) => (
            <Fragment key={i}>
              <SealedItem Icon={Icon} i={i} p={p} t={t} />
            </Fragment>
          ))}
        </div>
      </div>
      {/* phones: no room beside the grid, so the same wave loads as chips under it (space reserved,
          so nothing moves when they appear) */}
      {cols === 0 && (
        <div className="mt-4 flex max-w-[420px] flex-wrap justify-center gap-1.5">
          {SEALED_FEATURES.map((f, k) => (
            <Fragment key={f.title}>
              <FeatureChip f={f} k={k} p={p} t={t} />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** One background tile's load-in: it fades up, then its badge stamps on (scrubbed by scroll). */
function useFeatureIn(k: number, p: MotionValue<number>, t: (start: number, end: number) => [number, number]) {
  const s = FEATURES_FROM + k * FEATURE_STAGGER;
  const [a0, a1] = t(s, s + 0.35);
  const [b0, b1] = t(s + 0.2, s + 0.55);
  const mid = b0 + (b1 - b0) * 0.65;
  return {
    opacity: useTransform(p, [a0, a1], [0, 1]),
    y: useTransform(p, [a0, a1], [10, 0]),
    scale: useTransform(p, [a0, a1], [0.9, 1]),
    badgeScale: useTransform(p, [b0, mid, b1], [1.8, 0.92, 1]),
    badgeOpacity: useTransform(p, [b0, b0 + (b1 - b0) * 0.4], [0, 1]),
  };
}

function FeatureBadge({ kind, scale, opacity, small = false }: { kind: Feature['badge']; scale: MotionValue<number>; opacity: MotionValue<number>; small?: boolean }) {
  return kind === 'lock' ? (
    <motion.span
      style={{ scale, opacity }}
      className={`grid shrink-0 place-items-center rounded-full bg-accent text-white shadow-sm ${small ? 'h-3.5 w-3.5' : 'h-5 w-5'}`}
    >
      <Lock className={small ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
    </motion.span>
  ) : (
    // a tiny switch, on: "your choice", not encryption
    <motion.span
      style={{ scale, opacity }}
      className={`relative shrink-0 rounded-full bg-accent ${small ? 'h-2.5 w-[18px]' : 'h-3.5 w-6'}`}
    >
      <span className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white ${small ? 'right-[2px] h-1.5 w-1.5' : 'right-[2px] h-2.5 w-2.5'}`} />
    </motion.span>
  );
}

function FeatureTile({
  f,
  k,
  p,
  t,
  spot,
}: {
  f: Feature;
  k: number;
  p: MotionValue<number>;
  t: (start: number, end: number) => [number, number];
  spot: (typeof FEATURE_SPOTS)[number];
}) {
  const a = useFeatureIn(k, p, t);
  // background, not foreground: the outer column sits a step further back
  const opacity = useTransform(a.opacity, (o) => o * (spot.col === 0 ? 0.92 : 0.7));
  const offset = `calc(100% + ${FEATURE_GAP + spot.col * (FEATURE_W + FEATURE_GAP)}px)`;
  const { Icon } = f;
  return (
    <motion.div
      className="absolute -translate-y-1/2 rounded-2xl border border-black/[0.07] bg-white/90 p-3 text-left shadow-[0_16px_36px_-28px_rgba(10,11,16,0.5)]"
      style={{
        width: FEATURE_W,
        top: spot.top,
        ...(spot.side === 'left' ? { right: offset } : { left: offset }),
        opacity,
        y: a.y,
        scale: a.scale,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/[0.04]">
          <Icon className="h-4 w-4 text-accent/70" />
        </span>
        <FeatureBadge kind={f.badge} scale={a.badgeScale} opacity={a.badgeOpacity} />
      </div>
      <p className="mt-2 text-[10px] font-black uppercase leading-tight tracking-[0.12em] text-text/80">{f.title}</p>
      <p className="mt-0.5 text-[9.5px] leading-snug text-black/45">{f.sub}</p>
    </motion.div>
  );
}

function FeatureChip({ f, k, p, t }: { f: Feature; k: number; p: MotionValue<number>; t: (start: number, end: number) => [number, number] }) {
  const a = useFeatureIn(k, p, t);
  const { Icon } = f;
  return (
    <motion.span
      className="flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white/90 py-1 pl-2 pr-1.5 text-[10px] font-semibold text-text/75"
      style={{ opacity: a.opacity, y: a.y, scale: a.scale }}
    >
      <Icon className="h-3 w-3 text-accent/70" />
      {f.title}
      <FeatureBadge kind={f.badge} scale={a.badgeScale} opacity={a.badgeOpacity} small />
    </motion.span>
  );
}

function SealedItem({
  Icon,
  i,
  p,
  t,
}: {
  Icon: typeof ImageIcon;
  i: number;
  p: MotionValue<number>;
  t: (start: number, end: number) => [number, number];
}) {
  // the tile rises in (was: delay i*0.12s), then its lock stamps down with a small overshoot (was: a
  // spring at 0.6 + i*0.25s)
  const [a0, a1] = t(i * 0.12, i * 0.12 + 0.35);
  const opacity = useTransform(p, [a0, a1], [0, 1]);
  const y = useTransform(p, [a0, a1], [16, 0]);
  const [b0, b1] = t(0.6 + i * 0.25, 0.6 + i * 0.25 + 0.45);
  const mid = b0 + (b1 - b0) * 0.65;
  const lockScale = useTransform(p, [b0, mid, b1], [2.2, 0.92, 1]);
  const lockRotate = useTransform(p, [b0, mid], [-20, 0]);
  const lockOpacity = useTransform(p, [b0, b0 + (b1 - b0) * 0.4], [0, 1]);
  return (
    <motion.div
      style={{ opacity, y }}
      className="relative grid aspect-square place-items-center rounded-3xl border border-black/10 bg-white shadow-sm"
    >
      <Icon className="h-10 w-10 text-accent/70" />
      <motion.span
        style={{ scale: lockScale, rotate: lockRotate, opacity: lockOpacity }}
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-accent text-white shadow"
      >
        <Lock className="h-4 w-4" />
      </motion.span>
    </motion.div>
  );
}

/**
 * A heart that fills up — free forever, kept alive by people who care. It fills the moment it
 * arrives: the finale dissolves the heart into the big words within ~1.8 s, so a scroll-driven fill
 * was never seen.
 */
function SceneFree() {
  const reduce = useReducedMotion();
  return (
    <div className="relative grid h-72 w-72 place-items-center">
      <svg viewBox="0 0 100 92" className="h-64 w-64" aria-hidden="true">
        <defs>
          <clipPath id="msg-heart">
            <path d="M50 88 C 18 66, 2 46, 2 27 C 2 12, 14 2, 28 2 C 38 2, 46 8, 50 16 C 54 8, 62 2, 72 2 C 86 2, 98 12, 98 27 C 98 46, 82 66, 50 88 Z" />
          </clipPath>
        </defs>
        <path
          d="M50 88 C 18 66, 2 46, 2 27 C 2 12, 14 2, 28 2 C 38 2, 46 8, 50 16 C 54 8, 62 2, 72 2 C 86 2, 98 12, 98 27 C 98 46, 82 66, 50 88 Z"
          fill="white"
          stroke={INK}
          strokeOpacity="0.15"
          strokeWidth="1.5"
        />
        <g clipPath="url(#msg-heart)">
          <motion.rect
            x="0"
            width="100"
            height="92"
            fill={PINK}
            initial={{ y: reduce ? 30 : 92 }}
            // full while the heart is fully visible (the finale holds it ~0.7 s, then dissolves it)
            animate={{ y: reduce ? 30 : [92, 30, 38, 30] }}
            transition={reduce ? { duration: 0 } : { duration: 0.85, times: [0, 0.7, 0.85, 1], ease: 'easeOut' }}
          />
        </g>
      </svg>
      {/* ambient: hearts keep floating up on their own (not part of the story's timeline) */}
      {!reduce &&
        [0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className="absolute"
            style={{ left: `${18 + i * 16}%`, bottom: '12%', color: PINK }}
            animate={{ y: [0, -140], opacity: [0, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
          >
            <Heart className="h-4 w-4" fill="currentColor" />
          </motion.span>
        ))}
    </div>
  );
}

/* ── The story ─────────────────────────────────────────────────────────────── */

/**
 * Scales its child down (never up) so it always fits the space it is given, so the illustration,
 * the text and the buttons all fit in one screen on any viewport height.
 */
function FitBox({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const fit = () => {
      const h = inner.offsetHeight;
      const next = h > 0 ? Math.min(1, outer.clientHeight / h) : 1;
      setScale((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outerRef} className="relative flex min-h-0 w-full flex-1 items-center justify-center">
      <div ref={innerRef} className="w-full shrink-0" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
        {children}
      </div>
    </div>
  );
}

/** Height of the site header above the story, so the pinned stage fills exactly the rest. */
function useHeaderHeight() {
  const [h, setH] = useState(73);
  useEffect(() => {
    const el = document.querySelector('header');
    if (!el) return;
    const measure = () => setH(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return h;
}

type Scene = { title: ReactNode; plain: string; line: string; art: () => ReactNode; fullScreen?: boolean; wide?: boolean };

const SCENES: Scene[] = [
  {
    title: <>The <Accent>new-age</Accent> messenger.</>,
    plain: 'The new-age messenger.',
    line: 'Free forever. Private by default.',
    art: () => null, // drawn by the persistent PhonesStage
  },
  {
    title: <>Locked <Accent>end to end</Accent>.</>,
    plain: 'Locked end to end.',
    line: 'Not even we can read it.',
    art: () => null, // drawn by the persistent PhonesStage
  },
  {
    title: <>Phone broke? <Accent>Nothing lost.</Accent></>,
    plain: 'Phone broke? Nothing lost.',
    line: 'Your sealed key brings every message back.',
    art: () => null, // drawn by the persistent PhonesStage
  },
  {
    title: <>Every screen. <Accent>One us.</Accent> No matter where.</>,
    plain: 'Every screen. One us. No matter where.',
    line: 'New messages land on every device instantly — no sync, any platform, cloud or not.',
    art: () => null, // drawn by the persistent PhonesStage
  },
  {
    title: <>Hear them, <Accent>your way</Accent>.</>,
    plain: 'Hear them, your way.',
    line: 'Live, translated captions on calls. ✱',
    art: () => null, // drawn by the persistent PhonesStage (with the full-height language rail)
  },
  {
    title: <>Hard day? <Accent>Mr OneHook</Accent> is here.</>,
    plain: 'Hard day? Mr OneHook is here.',
    line: 'Advice, the right words, the context — you choose what he sees.',
    art: () => <SceneMrOneHook />,
    wide: true,
  },
  {
    title: <>Every memory, <Accent>sealed</Accent>.</>,
    plain: 'Every memory, sealed.',
    line: 'Photos, videos, voice notes, files — and calls, reactions, the lot.',
    art: () => <SceneSealed />,
  },
  {
    title: <>Free forever. <Accent>Kept alive by you.</Accent></>,
    plain: 'Free forever. Kept alive by you.',
    line: 'No ads. No fees. Ever. Support is optional.',
    art: () => <SceneFree />,
  },
];


/**
 * Each screen's choreography as AUTHORED, in seconds: every beat is written against this (e.g. screen
 * 2's checkpoints at 2.6 / 4.3 / 6.0 / 7.9 s of 8.9 s). It is the timeline beats are placed on, not
 * how long the screen plays — see SCENE_PLAY_SECONDS.
 */
const SCENE_SECONDS = [3.9, 8.9, 6.1, 5.4, 3.0, 3.2, 3.9, 1.8];
/** Every screen's animation plays for the same time; each screen's authored timeline is scaled to fit,
 *  so its beats keep their order and spacing (screen 2 runs a little faster, screen 8 slower). */
const SCREEN_PLAY_SECONDS = 5;
const SCENE_PLAY_SECONDS = SCENE_SECONDS.map(() => SCREEN_PLAY_SECONDS);
/** Every screen owns exactly one eighth of story progress, independent of choreography complexity. */
const STORY_BANDS = makeEqualBands(SCENES.length);

/** A thin bar under the counter on the screen's own clock: its animation fills the first ~70%, the rest
 *  fills while everything stays on screen to look at. */
function SceneProgress({ index }: { index: number }) {
  const p = useSceneLine(index);
  return (
    <div
      className="mx-auto mt-2 h-[3px] w-28 overflow-hidden rounded-full bg-black/10"
      role="progressbar"
      aria-label="Progress through this screen"
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div className="h-full rounded-full" style={{ background: PINK, transformOrigin: 'left center', scaleX: p }} />
    </div>
  );
}

/** The stage's layout: illustration (flex-1), words, buttons, with room for a collapsed phone toolbar. */
const STAGE_LAYOUT =
  'flex flex-col items-center overflow-hidden px-4 pb-[calc(100lvh-100svh+12px)] pt-1 sm:px-6 sm:pb-[calc(100lvh-100svh+32px)] sm:pt-6';

/**
 * One loaded screen as a page: the same layout as the stage, in its finished state, placed at
 * `(i - pos)` screens from the top so the strip slides with the scroll. `buttons` is an invisible
 * copy of the stage's button row, so every slide lays out exactly like the stage (the real buttons
 * stay pinned above the strip).
 */
function StorySlide({ i, pos, buttons }: { i: number; pos: MotionValue<number>; buttons: ReactNode }) {
  const y = useTransform(pos, (v) => `${(i - v) * 100}%`);
  const scene = SCENES[i];
  const n = SCENES.length;
  const finale = i === n - 1;
  return (
    <motion.div className={`absolute inset-0 ${STAGE_LAYOUT}`} style={{ y }}>
      {i === 5 && (
        <>
          <PinkStrokes />
          <MascotPeeks />
        </>
      )}
      {i === 4 && <LanguageRail handoff={false} />}
      <div className={`relative z-0 flex min-h-0 w-full flex-1 ${i <= 4 || scene.fullScreen ? '' : scene.wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        {i <= 4 ? (
          <div className="absolute inset-0">
            <PhonesStage index={i} />
          </div>
        ) : scene.fullScreen ? (
          <div className="absolute inset-0">{scene.art()}</div>
        ) : (
          // the finale's heart has faded into the background by the time the screen has played
          <div className="flex min-h-0 w-full flex-1" style={finale ? { opacity: 0 } : undefined}>
            <FitBox>
              <div className="flex w-full justify-center">{scene.art()}</div>
            </FitBox>
          </div>
        )}
      </div>
      <div className="relative z-10 mt-1 flex min-h-[78px] w-full max-w-3xl shrink-0 items-start justify-center text-center sm:mt-5 sm:min-h-[120px]">
        {!finale && (
          <div>
            <p className="font-mono text-[11px] text-black/30">
              {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
            </p>
            <SceneProgress index={i} />
            <p className="mt-1.5 text-2xl font-light leading-[1.08] tracking-[-0.02em] sm:mt-2 sm:text-5xl">{scene.title}</p>
            <p className="mt-2 text-sm font-light text-black/55 sm:mt-3 sm:text-lg">{scene.line}</p>
          </div>
        )}
      </div>
      {finale && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center justify-center px-6 text-center"
          style={{ bottom: 'clamp(84px, 14vh, 130px)' }}
        >
          <p className="font-mono text-xs text-black/30 sm:text-sm">
            {String(n).padStart(2, '0')} / {String(n).padStart(2, '0')}
          </p>
          <SceneProgress index={i} />
          <p className="mt-4 max-w-[16ch] font-light leading-[0.98] tracking-[-0.03em]" style={{ fontSize: 'clamp(3rem, 9vw, 8.5rem)' }}>
            {scene.title}
          </p>
          <p className="mt-6 text-base font-light text-black/55 sm:text-2xl">{scene.line}</p>
        </div>
      )}
      <div className="invisible" inert>
        {buttons}
      </div>
    </motion.div>
  );
}

export function Messenger() {
  const [lite] = useState(detectLite);
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const storyRef = useRef<HTMLDivElement>(null);
  const headerH = useHeaderHeight();
  // Progress starts at the initial, below-header stage position—not after the sticky header has
  // scrolled past—and finishes exactly where the bottom of the track meets the viewport bottom.
  const { scrollYProgress } = useScroll({ target: storyRef, offset: [`start ${headerH}px`, 'end end'] });

  const n = SCENES.length;
  // The page always scrolls natively: nothing intercepts the wheel, trackpad, touch, keyboard or
  // scrollbar. Scroll picks the screen; each screen's animation plays once, for the same time on every screen, the first
  // time it arrives going forward. Going back, or returning to a screen that has played, just switches
  // to its finished state (see storyTimeline.tsx).
  //
  // The footer exists only while the LAST screen is on stage. The stage can trail the scroll
  // (it walks screen by screen), so without this the page could scroll on past the track into the
  // footer while the stage still shows screen 3. Until screen 8 is up, the page simply ends at the
  // bottom of the track. Hiding it again is safe: whenever an earlier screen is on stage the reader is
  // inside the track, above it, so nothing in view moves.
  // new screens play once on the stage; screens already seen are a normal page above it (see storyTimeline.tsx)
  const { index, instant, play, line } = useStoryPlayback(scrollYProgress, STORY_BANDS, SCENE_PLAY_SECONDS, Boolean(reduce));
  // the footer only once the last screen is actually on stage (it can still be finishing an earlier one)
  // ...and only once screen 8 has had its time (its animation done, then SHOW_MIN_MS on the finished
  // screen). Otherwise a reader still scrolling when it arrives is carried straight past it into the
  // footer, and screen 8 is cut off half-shown.
  const [endingOpen, setEndingOpen] = useState(false);
  const atEnd = useRef(isStoryComplete(scrollYProgress.get()));
  const lastReady = useRef(false);
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    atEnd.current = isStoryComplete(p);
    if (atEnd.current && index === n - 1 && lastReady.current) setEndingOpen(true);
  });
  useEffect(() => {
    lastReady.current = false;
    if (index < n - 1) {
      setEndingOpen(false);
      return;
    }
    const last = play[n - 1];
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        lastReady.current = true;
        if (atEnd.current) setEndingOpen(true);
      }, SHOW_MIN_MS);
    };
    const off = last.on('change', (v) => v >= 1 && arm());
    if (last.get() >= 1) arm();
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [index, n, play]);
  const storyDone = endingOpen && index === n - 1;
  // The page can't run ahead of the stage: at most to the end of the next screen's section while a
  // screen plays (the cap moves on as each screen comes up; none on the last screen).
  // A reader who keeps trying to scroll while a screen plays is told why the page is holding: the
  // illustration is still playing, and scrolling continues once it finishes.
  const attempts = useRef<number[]>([]);
  const nudgeTimer = useRef(0);
  const [nudge, setNudge] = useState(false);
  const onBlocked = useCallback(() => {
    const list = attempts.current;
    list.push(performance.now());
    if (list.length > 40) list.shift();
    if (!isRepeatedAttempt(list)) return;
    setNudge(true);
    // it goes away on its own once the reader stops trying
    window.clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => setNudge(false), 2500);
  }, []);
  useEffect(() => {
    // a new screen on stage, or this one done playing: the hold is over
    const clear = () => {
      attempts.current = [];
      window.clearTimeout(nudgeTimer.current);
      setNudge(false);
    };
    clear();
    const off = play[index].on('change', (v) => v >= 1 && clear());
    return () => {
      off();
      window.clearTimeout(nudgeTimer.current);
    };
  }, [index, play]);
  useScrollLimit({
    scroll: scrollYProgress,
    maxProgress: scrollLimit(STORY_BANDS, index),
    enabled: !reduce,
    onBlocked,
  });
  const threadHeight = useTransform(scrollYProgress, (v) => `${Math.min(1, Math.max(0, v)) * 100}%`);
  // the screen we came from (updated after render, so during a render it is the previous screen)
  const prevIndex = useRef(index);
  useEffect(() => {
    prevIndex.current = index;
  }, [index]);
  const story = useMemo(
    () => ({ scroll: scrollYProgress, play, line, bands: STORY_BANDS, reduce: Boolean(reduce), instant }),
    [scrollYProgress, play, line, reduce, instant]
  );

  // Screens already seen are a normal page. `pos` is the reader's place in screens (screen i is
  // centred at pos = i), held at the stage's screen: at or below it the stage itself is showing;
  // above it, a strip of the loaded screens, finished, slides with the scroll like any page.
  const indexRef = useRef(index);
  indexRef.current = index;
  const pos = useTransform(scrollYProgress, (p) => Math.min(Math.max(0, p) * n, indexRef.current));
  // the loaded screen at the top of the view while the strip shows (null: the stage is showing)
  const [strip, setStrip] = useState<number | null>(null);
  useMotionValueEvent(pos, 'change', (v) => {
    const next = !reduce && v < indexRef.current - 0.001 ? Math.floor(v) : null;
    setStrip((prev) => (prev === next ? prev : next));
  });
  // the screen the reader is looking at (for the thread and the backdrop glow)
  const view = strip === null ? index : Math.min(index, Math.round(pos.get()));
  const hideStage = strip === null ? undefined : ('hidden' as const);
  const slideStory = useMemo(() => ({ ...story, instant: true }), [story]);

  // the same three buttons, always in the same place (also laid out, invisibly, in each page slide)
  const buttonsRow = (
    <motion.div
      className="relative z-10 mt-2 flex shrink-0 flex-wrap items-center justify-center gap-1.5 sm:mt-5 sm:gap-3"
      initial={false}
      animate={{ opacity: 1 }}
    >
      <GetAppLink
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[11px] sm:tracking-[0.22em] text-white transition-opacity hover:opacity-90"
      >
        <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Get the app
      </GetAppLink>
      <button
        type="button"
        onClick={() => navigate('/redeem')}
        {...trackProps(UiElement.LANDING_GET_STARTED)}
        // not on phones (/messenger): Get the app + Support only
        className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-black/15 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] sm:inline-flex sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[11px] sm:tracking-[0.22em] text-text/80 transition-colors hover:bg-black/[0.04]"
      >
        Start with an invite <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </button>
      <a
        href={DONATE_HREF}
        {...trackProps(UiElement.LANDING_EMAIL_LINK, { value: 'other' })}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#ff8fc7]/60 bg-[#ff8fc7]/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] sm:gap-2 sm:px-6 sm:py-3.5 sm:text-[11px] sm:tracking-[0.22em] text-text/80 transition-colors hover:bg-[#ff8fc7]/20"
      >
        <HandHeart className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: PINK }} /> Support
      </a>
    </motion.div>
  );

  const scene = SCENES[index];
  // Last screen ("Free forever"): the heart blurs and fades into the background, and the words take
  // over the whole stage—large and centred—with the buttons staying in their usual place.
  const finale = index === n - 1;


  useEffect(() => {
    const root = document.documentElement;
    const prev = { anchor: root.style.overflowAnchor, gutter: root.style.scrollbarGutter, behavior: root.style.scrollBehavior };
    root.style.overflowAnchor = 'none';
    root.style.scrollbarGutter = 'stable';
    // This page runs its own frame-accurate scroll manager (the scroll cap and its programmatic
    // clamp in useScrollLimit). The global `html { scroll-behavior: smooth }` must be off while it
    // is mounted: in Safari, smooth scroll-behavior animates every wheel tick and fights the clamp's
    // scrollTo (Safari does not reliably honour scrollTo's `instant` over the CSS value), which pins
    // the page and makes the mouse wheel look dead. Restored on unmount.
    root.style.scrollBehavior = 'auto';
    return () => {
      root.style.overflowAnchor = prev.anchor;
      root.style.scrollbarGutter = prev.gutter;
      root.style.scrollBehavior = prev.behavior;
    };
  }, []);

  return (
    <LiteContext.Provider value={lite}>
    <StoryTimelineProvider value={story}>
    <div className={`min-h-screen bg-[#FAFAF8] text-text ${lite ? 'oh-lite' : ''}`}>
      <Seo {...ROUTE_SEO['/messenger']} path="/messenger" />
      <ProgressBar background={`linear-gradient(90deg, ${PINK}, #1F3A6B 50%, ${PINK})`} />
      <SiteHeader pageTitle="Messenger" fitTitles={STORY_PAGE_TITLES} />

      <main>
        <h1 className="sr-only">OneHook Messenger — the new-age, end-to-end encrypted messenger, free forever</h1>

        {/* The whole story as real text, present from the first render: read by search engines and
            screen readers (the animated stage below is decorative for them). */}
        <section className="sr-only">
          {SCENES.map((s) => (
            <article key={s.plain}>
              <h2>{s.plain}</h2>
              <p>{s.line}</p>
            </article>
          ))}
        </section>

        {/* One stable large-viewport of scroll per screen, plus the sticky stage itself. */}
        <div ref={storyRef} className="relative" style={{ height: storyTrackHeight(n, headerH) }}>
          <div
            // Stable on phones: the stage's background covers the whole screen even with the browser's
            // toolbar collapsed (100lvh), but everything in it is laid out for the screen WITH the
            // toolbar (100svh), so nothing re-sizes or moves when the toolbar shows or hides while
            // scrolling. The extra strip the collapsed toolbar uncovers holds "Start with an invite".
            className={`sticky ${STAGE_LAYOUT}`}
            style={{ top: headerH, height: `calc(100lvh - ${headerH}px)` }}
          >
            {/* screen 6: Mr OneHook peeking in from the edges */}
            <div style={{ display: 'contents', visibility: hideStage }}>
              <AnimatePresence>
                {index === 5 && (
                  <Fragment key="peeks">
                    <PinkStrokes />
                    <MascotPeeks />
                  </Fragment>
                )}
              </AnimatePresence>
            </div>

            {/* screen 5: the supported-language list, rolling the full height of the screen */}
            <div style={{ display: 'contents', visibility: hideStage }}>
              <AnimatePresence>
                {index === 4 && (
                  <Fragment key="rail">
                    <LanguageRail handoff={prevIndex.current === SCENE_SYNC && !instant} />
                  </Fragment>
                )}
              </AnimatePresence>
            </div>

            {/* soft backdrop glow that drifts with the story */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute h-[36rem] w-[36rem] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(255,143,199,0.16), transparent 65%)' }}
              animate={{ left: `${10 + (view % 2) * 40}%`, top: `${10 + (view % 3) * 12}%` }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />

            {/* the loaded screens above the stage, as a page that slides with the scroll */}
            {strip !== null && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
                <MotionConfig skipAnimations>
                  <StoryTimelineProvider value={slideStory}>
                    {[strip, strip + 1]
                      .filter((i) => i <= index)
                      .map((i) => (
                        <Fragment key={i}>
                          <StorySlide i={i} pos={pos} buttons={buttonsRow} />
                        </Fragment>
                      ))}
                  </StoryTimelineProvider>
                </MotionConfig>
              </div>
            )}

            {/* 1 — the illustration is the hero. Screens 1–2 share one persistent phone stage (same
                key, so it never remounts); other screens scale down to fit the height that is left. */}
            <div aria-hidden="true" className={`relative z-0 flex min-h-0 w-full flex-1 ${index <= 4 || scene.fullScreen ? '' : scene.wide ? 'max-w-6xl' : 'max-w-3xl'}`} style={{ visibility: hideStage }}>
              <AnimatePresence mode="wait">
                {index <= 4 ? (
                  <motion.div
                    key="phones"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.02, transition: { duration: 0.45 } }}
                    className="absolute inset-0"
                  >
                    <PhonesStage index={index} />
                  </motion.div>
                ) : scene.fullScreen ? (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.35 } }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0"
                  >
                    {scene.art()}
                  </motion.div>
                ) : (
                  <motion.div
                    key={index}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 18 }}
                    animate={
                      finale && !reduce
                        ? lite
                          ? { opacity: [1, 1, 0], scale: [1, 1, 1.18] }
                          : { opacity: [1, 1, 0], scale: [1, 1, 1.18], filter: ['blur(0px)', 'blur(0px)', 'blur(18px)'] }
                        : lite
                          ? { opacity: 1, scale: 1, y: 0 }
                          : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
                    }
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04, y: -18 }}
                    transition={
                      finale && !reduce
                        ? { duration: 1.8, times: [0, 0.4, 1], ease: [0.4, 0, 0.2, 1] }
                        : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
                    }
                    className="flex min-h-0 w-full flex-1"
                  >
                    <FitBox>
                      <div className="flex w-full justify-center">{scene.art()}</div>
                    </FitBox>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 2 — a few words below it */}
            <div
              aria-hidden="true"
              className="relative z-10 mt-1 flex min-h-[78px] w-full max-w-3xl shrink-0 items-start justify-center text-center sm:mt-5 sm:min-h-[120px]"
              style={{ visibility: hideStage }}
            >
              {/* `custom` = "is the next screen the finale?" — when it is, the outgoing words rise and
                  grow toward the centre of the stage and dissolve there, right where the finale's big
                  headline is rising into focus, so 7 → 8 reads as one upward move. */}
              <AnimatePresence mode="wait" custom={finale}>
                {!finale && (
                <motion.div
                  key={index}
                  custom={finale}
                  variants={{
                    exit: (toFinale: boolean) =>
                      reduce
                        ? { opacity: 0 }
                        : toFinale
                          ? { opacity: 0, y: '-24vh', scale: 1.35, ...(lite ? {} : { filter: 'blur(6px)' }), transition: { duration: 0.75, ease: [0.4, 0, 0.2, 1] } }
                          : { opacity: 0, y: -14 },
                  }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={lite ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit="exit"
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="font-mono text-[11px] text-black/30">
                    {String(index + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
                  </p>
                  <SceneProgress index={index} />
                  <p className="mt-1.5 text-2xl font-light leading-[1.08] tracking-[-0.02em] sm:mt-2 sm:text-5xl">{scene.title}</p>
                  <p className="mt-2 text-sm font-light text-black/55 sm:mt-3 sm:text-lg">{scene.line}</p>
                </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* finale: the words take the whole stage, centred (behind the buttons, above the faded heart) */}
            <div style={{ display: 'contents', visibility: hideStage }}>
            <AnimatePresence>
              {finale && (
                <motion.div
                  key="finale-words"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center justify-center px-6 text-center"
                  style={{ bottom: 'clamp(84px, 14vh, 130px)' }}
                  // rises from where the caption sat (below) into the centre, growing into focus — it
                  // starts while screen 7's words are still dissolving upward, so the two blend
                  initial={reduce ? { opacity: 0 } : lite ? { opacity: 0, y: '24vh', scale: 0.55 } : { opacity: 0, y: '24vh', scale: 0.55, filter: 'blur(6px)' }}
                  animate={lite ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, transition: { duration: 0.3 } }}
                  transition={{ delay: reduce ? 0 : 0.3, duration: reduce ? 0.2 : 1, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="font-mono text-xs text-black/30 sm:text-sm">
                    {String(n).padStart(2, '0')} / {String(n).padStart(2, '0')}
                  </p>
                  <SceneProgress index={index} />
                  <p className="mt-4 max-w-[16ch] font-light leading-[0.98] tracking-[-0.03em]" style={{ fontSize: 'clamp(3rem, 9vw, 8.5rem)' }}>
                    {scene.title}
                  </p>
                  <p className="mt-6 text-base font-light text-black/55 sm:text-2xl">{scene.line}</p>
                </motion.div>
              )}
            </AnimatePresence>
            </div>

            {/* why the page is holding, if the reader keeps trying to scroll while a screen plays */}
            <div
              role="status"
              aria-live="polite"
              // at the top of the stage, clear of the headline and the buttons
              className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4 sm:top-3"
            >
              <AnimatePresence>
                {nudge && (
                  <motion.p
                    key="nudge"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="max-w-sm rounded-2xl sm:max-w-none bg-[#0A0B10]/90 px-4 py-2.5 text-center text-xs leading-relaxed text-white shadow-lg sm:text-sm"
                  >
                    Hang on, the illustration is still playing. Scrolling continues once it finishes.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* 3 — the same three buttons, always in the same place */}
            {buttonsRow}

            {/* phones: the strip a collapsed browser toolbar uncovers (100lvh − 100svh) — it shows only
                then, and nothing else moves */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center overflow-hidden sm:hidden" style={{ height: 'calc(100lvh - 100svh)' }}>
              <button
                type="button"
                onClick={() => navigate('/redeem')}
                {...trackProps(UiElement.LANDING_GET_STARTED)}
                className="pointer-events-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-black/15 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-text/80 transition-colors hover:bg-black/[0.04]"
              >
                Start with an invite <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* the continuous thread: one pink line that fills as the story unfolds */}
            <div aria-hidden="true" className="absolute right-6 top-1/2 hidden h-64 -translate-y-1/2 flex-col items-center sm:flex">
              <div className="relative h-full w-[2px] rounded-full bg-black/10">
                <motion.div className="absolute left-0 top-0 w-full rounded-full" style={{ height: threadHeight, background: PINK }} />
              </div>
              <div className="absolute inset-0 flex flex-col justify-between">
                {SCENES.map((s, i) => (
                  <span
                    key={s.plain}
                    className="-ml-[3px] h-2 w-2 rounded-full transition-all duration-300"
                    style={{ background: i <= view ? PINK : 'rgba(10,11,16,0.15)', transform: i === view ? 'scale(1.6)' : 'scale(1)' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* the footer follows the last screen directly — only once screen 8 is on stage */}
      <div style={storyDone ? undefined : { display: 'none' }}>
        <SiteFooter />
      </div>
    </div>
    </StoryTimelineProvider>
    </LiteContext.Provider>
  );
}
