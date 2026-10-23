import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
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
} from 'lucide-react';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { Seo } from '../common/Seo';
import { ROUTE_SEO } from '../../config/seo-routes';
import { AlienScanner } from '../mascot';
import { QRCodeSVG } from 'qrcode.react';
import { ManifestoPhone } from '../Landing';
import { Finale, ProgressBar } from '../science/Science';
import { AppleIcon, GoogleIcon } from '../common/BrandIcons';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { APP_DOWNLOAD_URL } from '../../config/membership.config';

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
  children,
}: {
  land: { w: number; h: number };
  port: { w: number; h: number };
  children: (layout: 'land' | 'port') => ReactNode;
}) {
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
  const layout = box.h > 0 && box.w / box.h >= 1.05 ? 'land' : 'port';
  const dim = layout === 'land' ? land : port;
  const scale = box.w && box.h ? Math.min(box.w / dim.w, box.h / dim.h, 1.3) : 0;
  return (
    // overflow stays visible: the canvas is already scaled to fit, and clipping would cut the
    // phones' soft shadows into a hard line where the text below begins.
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-visible [&>*]:pointer-events-auto">
      {scale > 0 && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ width: dim.w, height: dim.h, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center' }}
        >
          {children(layout)}
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
function HiddenThread({ on, delay = 0 }: { on: boolean; delay?: number }) {
  const rows = [
    { me: false, w: '78%' },
    { me: true, w: '58%' },
    { me: true, w: '70%' },
  ];
  return (
    <div className="flex flex-col gap-1" aria-hidden="true">
      {rows.map((r, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ opacity: on ? 1 : 0, y: on ? 0 : 4 }}
          transition={{ delay: on ? delay + i * 0.1 : 0, duration: 0.3 }}
          style={{ width: r.w }}
          className={`flex items-center gap-1 rounded-lg px-1.5 py-1 ${
            r.me ? 'self-end bg-[#0A0B10]/75 text-white' : 'self-start bg-white text-text ring-1 ring-black/5'
          }`}
        >
          <Lock className="h-2 w-2 shrink-0 opacity-70" />
          <span className="h-[5px] flex-1 rounded-full bg-current opacity-30 blur-[1.5px]" />
        </motion.span>
      ))}
    </div>
  );
}

function DeviceLabel({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="mt-2.5 flex flex-col items-center text-center">
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-text/80">
        {icon} {title}
      </span>
      <span className="mt-0.5 text-[9px] text-black/45">{sub}</span>
    </div>
  );
}

/** Small "synced" tick that pops onto a device. */
function SyncedTick({ on, delay }: { on: boolean; delay: number }) {
  return (
    <motion.span
      className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-[#16a34a] text-white shadow"
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

/** A solid line that reaches `at`, a cross mark there, then a dotted remainder: it cannot get through. */
function FailLine({ first, rest, at, start, k, label, labelSide }: { first: string; rest: string; at: P; start: number; k: number; label: string; labelSide: 'left' | 'right' | 'above' }) {
  const hit = (start + SYNC.draw) * k;
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
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: start * k, duration: SYNC.draw * k, ease: 'easeOut' }}
        />
        <motion.path
          d={rest}
          fill="none"
          stroke="rgba(10,11,16,0.28)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1.5 6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: hit + 0.05, duration: 0.4 }}
        />
      </svg>
      <motion.span
        className="absolute z-20 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#b42318] shadow ring-1 ring-[#b42318]/30"
        style={{ left: at.x, top: at.y }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.25, 1], opacity: 1 }}
        transition={{ delay: hit, duration: 0.35 }}
      >
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
          <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </motion.span>
      <motion.span
        className="absolute z-20 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] shadow-sm ring-1 ring-[#b42318]/20"
        style={{ ...labelStyle, color: FAIL }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: hit + 0.1, duration: 0.3 }}
      >
        {label}
      </motion.span>
    </>
  );
}

/** A full (solid) straight line drawn when a sync succeeds. */
function OkLine({ d, start, k, color = 'rgba(10,11,16,0.35)' }: { d: string; start: number; k: number; color?: string }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: start * k, duration: SYNC.draw * k, ease: 'easeOut' }}
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
  port: { cloud: { x: 210, y: 130 }, xL: 105, xR: 315, rowTop: 420, rowBot: 1080, gutterL: 4, gutterR: 416 },
} as const;

/** A device standing on its row baseline (so a row lines up exactly), with its label just below. */
function Stand({ x, base, delay, children, label, into }: { x: number; base: number; delay: number; children: ReactNode; label: ReactNode; into: P }) {
  const appear = {
    initial: { opacity: 0, scale: 0.85, y: 12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: { delay, type: 'spring' as const, stiffness: 180, damping: 18 },
  };
  return (
    <>
      {/* on the way out every device is gathered into the main phone */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-full"
        style={{ left: x, top: base, transformOrigin: 'bottom center' }}
        {...appear}
        exit={{ left: into.x, top: into.y + 60, scale: 0.15, opacity: 0, transition: { duration: 0.55, ease: [0.5, 0, 0.75, 0] } }}
      >
        {children}
      </motion.div>
      <motion.div className="absolute -translate-x-1/2" style={{ left: x, top: base + 4 }} {...appear} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
        {label}
      </motion.div>
    </>
  );
}

function SyncDevices({ layout, phone, k }: { layout: 'land' | 'port'; phone: Pose; k: number }) {
  const [synced, setSynced] = useState({ ipad: false, android: false, laptop: false });
  const [newOn, setNewOn] = useState(false);
  useEffect(() => {
    const at = (s: number, fn: () => void) => window.setTimeout(fn, s * 1000 * k);
    const timers = [
      at(SYNC.ipad + SYNC.keyHop, () => setSynced((p) => ({ ...p, ipad: true }))),
      at(SYNC.android + SYNC.keyHop, () => setSynced((p) => ({ ...p, android: true }))),
      at(SYNC.laptopQr + 1.2, () => setSynced((p) => ({ ...p, laptop: true }))),
      at(NEW_AT, () => setNewOn(true)),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [k]);

  const land = layout === 'land';
  const G = SYNC_LAYOUT[layout];
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
  const crossYL = land ? 385 : 880;
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
  const aGap = land ? androidLeft - 40 : androidRight + 22;
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
      {/* full lines: cloud → iPad, cloud → Android, and the QR from the main phone to the laptop */}
      <OkLine d={poly(toIpad)} start={SYNC.appear + 0.2} k={k} />
      <OkLine d={poly(toAndroid)} start={SYNC.appear + 0.2} k={k} />
      <OkLine d={poly(qrLaptop)} start={SYNC.laptopQr} k={k} color={PINK} />

      {/* the cloud can't reach the laptop or the camping phone; no device's QR reaches the camping phone */}
      <FailLine {...cloudToLaptop} start={SYNC.cloudFail} k={k} label="Cloud not reachable" labelSide="right" />
      <FailLine {...cloudToCamp} start={SYNC.cloudFail} k={k} label="Cloud not reachable" labelSide="left" />
      <FailLine {...phoneToCamp} start={SYNC.phoneTry} k={k} label="Out of reach" labelSide={land ? 'above' : 'left'} />
      <FailLine {...androidToCamp} start={SYNC.androidTry} k={k} label="Out of reach" labelSide={land ? 'left' : 'right'} />

      {/* a key on each line leaving the cloud — it pulses as that device's key arrives */}
      {[
        { at: { x: xL, y: (C.y + ipadTop) / 2 }, pulse: SYNC.ipad },
        { at: { x: xR, y: (C.y + androidTop) / 2 }, pulse: SYNC.android },
      ].map((b, i) => (
        <motion.span
          key={i}
          className="absolute z-30 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-[0_8px_22px_-6px_rgba(255,143,199,0.9)]"
          style={{ left: b.at.x, top: b.at.y, background: INK }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: [0.6, 1, 1, 1.25, 1] }}
          transition={{ delay: (SYNC.appear + 0.5) * k, duration: (b.pulse + SYNC.keyHop - SYNC.appear - 0.5) * k, times: [0, 0.15, 0.7, 0.85, 1] }}
        >
          <KeyRound className="h-3.5 w-3.5" style={{ color: PINK }} />
        </motion.span>
      ))}

      {/* the QR, sitting in the middle of the line from the main phone to the laptop */}
      <motion.span
        className="absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-black/10"
        style={{ left: qrMid.x, top: qrMid.y }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: [0.6, 1.15, 1] }}
        transition={{ delay: (SYNC.laptopQr + SYNC.draw * 0.5) * k, duration: 0.4 }}
      >
        <QrCode className="h-6 w-6 text-text" />
      </motion.span>

      {/* top-left · iPad — synced from the cloud */}
      <Stand into={{ x: phone.cx, y: phone.cy }} x={xL} base={rowTop} delay={(SYNC.appear + 0 * 0.12) * k} label={<DeviceLabel icon={<AppleIcon className="h-3 w-3" />} title="iPad" sub="Synced from your cloud, automatically" />}>
        <div className="relative rounded-[18px] bg-[#0A0B10] p-[7px] shadow-[0_24px_50px_-26px_rgba(10,11,16,0.6)]" style={{ width: DEV.ipad.w, height: DEV.ipad.h }}>
          <div className="h-full w-full overflow-hidden rounded-[12px] bg-[#F6F6F4]">
            <MiniThread on={synced.ipad} newOn={newOn} />
          </div>
          <SyncedTick on={synced.ipad} delay={0} />
        </div>
      </Stand>

      {/* bottom-left · Windows laptop — cloud not reachable, so the main phone syncs it by QR and the
          whole history drops in at once */}
      <Stand
        into={{ x: phone.cx, y: phone.cy }}
        x={xL}
        base={rowBot}
        delay={(SYNC.appear + 2 * 0.12) * k}
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
                <HiddenThread on delay={(SYNC.appear + 0.3) * k} />
                <span className="mt-auto flex items-center gap-1 self-center rounded-md bg-white px-1.5 py-1 text-[6.5px] text-black/55 ring-1 ring-black/5">
                  <QrCode className="h-2.5 w-2.5" /> Waiting for a QR from your phone
                </span>
              </motion.div>
              <div className="absolute inset-0">
                <MiniThread on={synced.laptop} size="md" stagger={0} newOn={newOn} />
              </div>
            </div>
            <SyncedTick on={synced.laptop} delay={0} />
          </div>
          <div className="mx-auto h-[9px] w-[118%] -translate-x-[8%] rounded-b-[8px] bg-gradient-to-b from-[#c9cbd1] to-[#9fa3ab]" />
        </div>
      </Stand>

      {/* top-right · Android — synced from the cloud */}
      <Stand into={{ x: phone.cx, y: phone.cy }} x={xR} base={rowTop} delay={(SYNC.appear + 1 * 0.12) * k} label={<DeviceLabel icon={<GoogleIcon className="h-3 w-3" />} title="Android" sub="Synced from your cloud, automatically" />}>
        <div className="relative rounded-[18px] bg-[#0A0B10] p-[5px] shadow-[0_24px_50px_-26px_rgba(10,11,16,0.6)]" style={{ width: DEV.phone.w, height: DEV.phone.h }}>
          <span className="absolute left-1/2 top-[9px] z-10 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-black" />
          <div className="h-full w-full overflow-hidden rounded-[14px] bg-[#F6F6F4]">
            <MiniThread on={synced.android} newOn={newOn} />
          </div>
          <SyncedTick on={synced.android} delay={0} />
        </div>
      </Stand>

      {/* bottom-right · the camping phone: no cloud and no device in reach — earlier chat stays hidden,
          but every new message still lands */}
      <Stand into={{ x: phone.cx, y: phone.cy }} x={xR} base={rowBot} delay={(SYNC.appear + 3 * 0.12) * k} label={<DeviceLabel icon={<Tent className="h-3 w-3" />} title="Camping phone" sub="Out of everyone’s reach — new messages still arrive" />}>
        <div className="relative">
          {/* the campsite, kept below the lines that come in at the phone's sides */}
          <TreePine aria-hidden="true" className="absolute -left-9 bottom-0 h-8 w-8 text-[#2b3647]/30" />
          <TreePine aria-hidden="true" className="absolute -left-4 -bottom-0.5 h-5 w-5 text-[#2b3647]/25" />
          <TreePine aria-hidden="true" className="absolute -right-9 bottom-0 h-7 w-7 text-[#2b3647]/30" />
          <Tent aria-hidden="true" className="absolute -right-14 -bottom-0.5 h-6 w-6 text-[#2b3647]/45" />
          <div className="relative rounded-[18px] bg-[#0A0B10] p-[5px] shadow-[0_24px_50px_-26px_rgba(10,11,16,0.6)]" style={{ width: DEV.phone.w, height: DEV.phone.h }}>
            <div className="flex h-full w-full flex-col gap-1 overflow-hidden rounded-[14px] bg-[#F6F6F4] p-1.5">
              <HiddenThread on delay={(SYNC.appear + 0.3) * k} />
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
function ScreenPreviews({ layout, k }: { layout: 'land' | 'port'; k: number }) {
  const reduce = useReducedMotion() ?? false;
  const land = layout === 'land';
  const L = LAYOUTS[layout];
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
        { x: 72, y: 220 },
        { x: 210, y: 220 },
        { x: 348, y: 220 },
        { x: 72, y: 1080 },
        { x: 210, y: 1080 },
        { x: 348, y: 1080 },
      ];
  // where each card's line meets the phone
  const meet = (i: number) =>
    land ? { x: i < 3 ? cx - pw : cx + pw, y: spots[i].y } : { x: spots[i].x, y: spots[i].y < cy ? cy - PH * s * 0.5 : cy + PH * s * 0.5 };
  const start = 2.2; // after the phone has landed

  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
      {/* the free-forever heart, glowing behind the phone */}
      <motion.svg
        aria-hidden="true"
        viewBox="0 0 100 92"
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: cx, top: cy, width: land ? 760 : 400 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={reduce ? { opacity: 0.16, scale: 1 } : { opacity: [0, 0.18, 0.12, 0.18], scale: [0.8, 1, 1.03, 1] }}
        transition={reduce ? { duration: 0.3 } : { delay: 1.2, duration: 4, times: [0, 0.3, 0.65, 1], repeat: Infinity, repeatType: 'reverse' }}
      >
        <path
          d="M50 88 C 18 66, 2 46, 2 27 C 2 12, 14 2, 28 2 C 38 2, 46 8, 50 16 C 54 8, 62 2, 72 2 C 86 2, 98 12, 98 27 C 98 46, 82 66, 50 88 Z"
          fill={PINK}
          style={{ filter: 'blur(2px)' }}
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
            style={{ left: at.x, top: at.y, scale: land ? 1 : 0.6 }}
            initial={{ opacity: 0, x: fromSide, y: land ? 0 : 16 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay: (start + (i % 3) * 0.12 + (i >= 3 ? 0.06 : 0)) * k, type: 'spring', stiffness: 160, damping: 18 }}
          >
            <motion.div
              animate={reduce ? undefined : { y: [0, -4, 0] }}
              transition={reduce ? undefined : { duration: 4 + (i % 3) * 0.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
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
    solo: { cx: 210, cy: 650, s: 1.3 },
    left: { cx: 95, cy: 171, s: 0.72 },
    right: { cx: 325, cy: 1129, s: 0.72 },
    broken: { cx: 130, cy: 1040, s: 0.8 },
    fresh: { cx: 280, cy: 340, s: 0.86 },
    cloud: { x: 210, y: 700 },
    center: { cx: 210, cy: 660, s: 0.64 },
    aside: { cx: -900, cy: 1040, s: 0.8 },
    cloud4: { x: 210, y: 130 },
  },
} as const;
const at = (p: Pose) => ({ left: p.cx - PW / 2, top: p.cy - PH / 2, scale: p.s });

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

/**
 * Screens 1–3 share this stage, so the phone never leaves.
 *  1 · Isha's phone drops in and a conversation plays.
 *  2 · It glides left, Rohan's phone drops in, Isha sends a message and it travels past attackers
 *      (noise), OneHook's database (sealed) and friends & family (biometrics fail) to Rohan.
 *  3 · Isha's phone falls and breaks; her sealed key rises to the cloud, a new phone drops in, the
 *      key flies into it and her whole history comes back.
 */
function PhonesStage({ index }: { index: number }) {
  const reduce = useReducedMotion() ?? false;
  const still = useMotionValue(0);
  const journey = index === 1;
  const broken = index >= 2;
  const syncing = index >= 3;
  const lang = index >= 4; // screen 5: everything gathers into the phone, which becomes the caption window
  const k = reduce ? 1 / 3 : 1;
  // Arriving straight onto screen 4 (scrolling back up from screen 5): the new phone is simply there —
  // no slide-in, no unboxing, history already on it.
  const direct = useRef(index >= 3).current;
  const [newMsg, setNewMsg] = useState(false);
  // The new phone (with its box) is rebuilt every time we arrive on screen 3, so the unboxing plays
  // again whichever way you scroll in. It only starts "already unboxed" when the stage itself first
  // mounts on screen 4/5 (scrolling back up from further down).
  const [freshGen, setFreshGen] = useState(0);
  const [freshDirect, setFreshDirect] = useState(index >= 3);
  const prevIndex = useRef(index);
  useEffect(() => {
    if (index === 2 && prevIndex.current !== 2) {
      setFreshGen((g) => g + 1);
      setFreshDirect(false);
    }
    prevIndex.current = index;
  }, [index]);
  useEffect(() => {
    if (!syncing) {
      setNewMsg(false);
      return;
    }
    const id = window.setTimeout(() => setNewMsg(true), NEW_AT * 1000 * k);
    return () => window.clearTimeout(id);
  }, [syncing, k]);

  // once Isha has sent the message it stays in her thread
  const [sent, setSent] = useState(false);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (index >= 1) setSent(true);
    if (!journey) {
      setStage(0);
      return;
    }
    const timers = JOURNEY_TIMES.map((t, i) => window.setTimeout(() => setStage(i + 1), t * k));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [index, journey, k]);

  const stops: Stop[] = ['attackers', 'database', 'family'];
  const stateOf = (i: number) => (stage === i + 1 ? 'active' : stage > i + 1 ? 'done' : 'idle') as 'idle' | 'active' | 'done';
  const spring = { type: 'spring' as const, stiffness: 70, damping: 16, mass: 1 };
  const travel = { duration: reduce ? 0.2 : 0.9, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] };

  return (
    <FitCanvas land={LAYOUTS.land} port={LAYOUTS.port}>
      {(layout) => {
        const L = LAYOUTS[layout];
        const ishaPose = syncing ? L.aside : broken ? L.broken : journey ? L.left : L.solo;
        const isha = at(ishaPose);
        const rohan = at(L.right);
        const fresh = at(syncing ? L.center : L.fresh);
        const ishaRotate = broken ? TILT : journey ? 0 : -6;
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
                  <ScreenPreviews layout={layout} k={k} />
                </Fragment>
              )}
            </AnimatePresence>

            {/* screen 2: route + checkpoints + travelling message (behind the phones) */}
            <AnimatePresence>
              {journey && (
                <motion.div
                  key="journey"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 1.4 * k, duration: 0.5 } }}
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
                    <>
                      <div className="absolute left-1/2 top-[360px] h-[580px] w-[2px] -translate-x-1/2 rounded-full bg-black/10">
                        <motion.div
                          className="absolute left-0 top-0 w-full rounded-full"
                          style={{ background: `linear-gradient(180deg, ${INK}, ${PINK})` }}
                          animate={{ height: `${(stage / 4) * 100}%` }}
                          transition={travel}
                        />
                      </div>
                      {stops.map((s, i) => {
                        const y = 360 + ((i + 1) / 4) * 580;
                        const leftSide = i !== 1;
                        return (
                          <div key={s} className="absolute" style={{ left: L.w / 2, top: y }}>
                            <span
                              className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
                              style={{ borderColor: stage >= i + 1 ? PINK : 'rgba(10,11,16,0.2)' }}
                            />
                            <div className="absolute top-0 -translate-y-1/2" style={leftSide ? { right: 16 } : { left: 16 }}>
                              <Checkpoint kind={s} state={stateOf(i)} width={188} />
                            </div>
                          </div>
                        );
                      })}
                      <motion.div
                        className="absolute left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                        initial={{ top: 360, opacity: 0 }}
                        animate={{ top: 360 + (stage / 4) * 580, opacity: stage >= 1 && stage < 4 ? 1 : 0 }}
                        transition={travel}
                      >
                        <Packet />
                      </motion.div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* screen 4: iPad · Windows laptop · Android · camping phone, mirrored around the new
                phone — rendered before the cloud so every line starts hidden behind it */}
            <AnimatePresence>
              {syncing && !lang && (
                <Fragment key="sync">
                  <SyncDevices layout={layout} phone={L.center} k={k} />
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
                    animate={{ left: syncing ? L.cloud4.x : L.cloud.x, top: syncing ? L.cloud4.y : L.cloud.y, opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      left: spring,
                      top: spring,
                      default: { delay: syncing ? 0 : 1.4 * k, duration: direct ? 0.3 : 0.6, ease: [0.22, 1, 0.36, 1] },
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
                    <span className="w-max max-w-[400px] text-center text-[10px] font-semibold uppercase leading-relaxed tracking-[0.22em] text-black/40">
                      Your key, sealed in your cloud account — Apple, Google and more
                    </span>
                  </motion.div>
                  {index === 2 && (
                    <motion.span
                      className="absolute z-30 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-[0_10px_30px_-6px_rgba(255,143,199,0.9)]"
                      style={{ background: INK }}
                      initial={{ left: keyPath.left[0], top: keyPath.top[0], opacity: 0, scale: 0.6 }}
                      animate={{ left: keyPath.left, top: keyPath.top, opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.7] }}
                      transition={{ delay: 1.7 * k, duration: (KEY_IN - 1.7) * k, times: [0, 0.32, 0.76, 1], ease: 'easeInOut' }}
                    >
                      <KeyRound className="h-5 w-5" style={{ color: PINK }} />
                    </motion.span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Isha's phone: drops in once, then glides between poses — and on screen 3 falls & breaks */}
            <motion.div
              className="absolute z-20"
              style={{ width: PW, height: PH, transformStyle: 'preserve-3d' }}
              initial={
                reduce
                  ? { ...isha, opacity: 0, rotate: ishaRotate }
                  : { left: isha.left, top: -PH - 260, scale: isha.scale * 0.88, rotate: -26, rotateX: 38, rotateY: -12, opacity: 0 }
              }
              animate={{ ...isha, rotate: ishaRotate, rotateX: 0, rotateY: 0, opacity: syncing ? 0 : 1 }}
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
                  animate={reduce || index > 0 ? { y: 0 } : { y: [0, -6, 0] }}
                  transition={reduce || index > 0 ? { duration: 0.4 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
                  className="relative"
                >
                  <motion.div
                    animate={{ opacity: broken ? 0.42 : 1, filter: broken ? 'grayscale(1)' : 'grayscale(0)' }}
                    transition={{ delay: broken ? 1.5 * k : 0, duration: 0.6 }}
                  >
                    <ManifestoPhone
                      progress={still}
                      reduce
                      initialTab="messages"
                      liveThread={sent ? ISHA_SENDS : ISHA_HELLO}
                      liveDelay={sent ? SEND_DELAY * k : reduce ? 300 : 1500}
                      contactName="Rohan"
                      contactPhoto="/media/profile-demo/profile-3.jpg"
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

            {/* Rohan's phone: drops in from the top on screen 2 */}
            <AnimatePresence>
              {journey && (
                <motion.div
                  key="rohan"
                  className="absolute z-20"
                  style={{ width: PW, height: PH, transformStyle: 'preserve-3d' }}
                  initial={reduce ? { ...rohan, opacity: 0 } : { left: rohan.left, top: -PH - 260, scale: rohan.scale * 0.88, rotate: 18, rotateX: 34, opacity: 0 }}
                  animate={{ ...rohan, rotate: 0, rotateX: 0, opacity: 1 }}
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
                    liveThread={ROHAN_RECEIVES}
                    liveDelay={JOURNEY_TIMES[3] * k}
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
                  <TranslationBurst layout={layout} k={k} />
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
                        ? { ...fresh, rotate: TILT, opacity: 0 }
                        : { ...fresh, rotate: TILT, x: 1100, opacity: 1 }
                  }
                  animate={
                    lang
                      ? // screen 5: with every device gathered inside it, the phone drops and shrinks into the caption window
                        { left: L.w / 2 - PW / 2, top: L.h / 2 - PH / 2 + 70, scale: fresh.scale * 0.42, rotate: 10, x: 0, opacity: 0 }
                      : { ...fresh, rotate: syncing ? 0 : TILT, x: 0, opacity: 1 }
                  }
                  exit={reduce ? { opacity: 0 } : { x: 1100, transition: { duration: 0.55, ease: [0.5, 0, 0.75, 0] } }}
                  transition={
                    lang
                      ? { delay: reduce ? 0 : 0.45, duration: reduce ? 0.2 : 0.55, ease: [0.55, 0, 1, 0.45], opacity: { delay: reduce ? 0 : 0.75, duration: 0.25 } }
                      : reduce
                      ? { duration: 0.3, delay: BOX_IN * k }
                      : {
                          x: { delay: BOX_IN, duration: 0.85, ease: [0.16, 1, 0.3, 1] },
                          left: spring,
                          top: spring,
                          scale: spring,
                          rotate: { type: 'spring', stiffness: 60, damping: 13 },
                          opacity: { duration: 0.3 },
                        }
                  }
                >
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
                      liveThread={newMsg ? ISHA_WITH_NEW : ISHA_SENDS}
                      liveDelay={newMsg || freshDirect ? 0 : RESTORE_AT * 1000 * k}
                      liveSpeed={freshDirect ? 0.01 : 0.28}
                      contactName="Rohan"
                      contactPhoto="/media/profile-demo/profile-3.jpg"
                      className="relative isolate"
                    />
                    {/* the key lands: a soft pulse of light on the glass */}
                    <motion.span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[11px] rounded-[2.25rem]"
                      style={{ boxShadow: `0 0 0 2px ${PINK}, 0 0 40px 6px rgba(255,143,199,0.55)` }}
                      initial={{ opacity: 0 }}
                      animate={freshDirect ? { opacity: 0 } : { opacity: [0, 1, 0] }}
                      transition={{ delay: KEY_IN * k, duration: 0.9 * k }}
                    />
                  </div>

                  {/* lid: slides down off the box and out of view, passing behind the text */}
                  <motion.div
                    aria-hidden="true"
                    className="absolute -inset-[18px] rounded-[3.1rem]"
                    style={{
                      background: 'linear-gradient(180deg, #FFFFFF 0%, #F6F6F4 55%, #EFEFEC 100%)',
                      boxShadow: '0 30px 70px -34px rgba(10,11,16,0.4), 0 0 0 1px rgba(10,11,16,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
                    }}
                    // Far enough to leave any window: the canvas is scaled down a lot on phones, so a short
                    // slide could stop mid-screen. It travels ~4000 canvas px (several screen heights at
                    // any scale) and fades out on the way, so it never lingers.
                    initial={freshDirect ? { y: LID_TRAVEL, opacity: 0 } : { y: 0, opacity: 1 }}
                    animate={freshDirect || reduce ? { y: LID_TRAVEL, opacity: 0 } : { y: [0, LID_TRAVEL], opacity: [1, 1, 0] }}
                    transition={
                      reduce
                        ? { delay: LID_OFF * k, duration: 0.3 }
                        : { delay: LID_OFF, duration: 1.3, ease: [0.55, 0, 0.75, 0.4], opacity: { delay: LID_OFF, duration: 1.3, times: [0, 0.7, 1] } }
                    }
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
                    animate={syncing ? { opacity: 0, scale: 0.8, y: -8 } : { opacity: 1, scale: 1, y: 0 }}
                    transition={syncing ? { duration: 0.3 } : { delay: (RESTORE_AT + 1.5) * k, type: 'spring', stiffness: 260, damping: 15 }}
                  >
                    <Check className="h-3.5 w-3.5" /> Every message back
                  </motion.span>
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
function TranslationBurst({ layout, k }: { layout: 'land' | 'port'; k: number }) {
  const reduce = useReducedMotion() ?? false;
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
        <motion.div
          key={b.i}
          className="absolute w-[230px] -translate-x-1/2 -translate-y-1/2"
          style={b.blurred ? { filter: 'blur(6px)' } : undefined}
          initial={{ left: cx, top: cy, scale: 0.2, opacity: 0 }}
          animate={{ left: b.x, top: b.y, scale: b.s, opacity: b.blurred ? 0.35 : 1 }}
          transition={
            reduce
              ? { duration: 0.3, delay: b.delay * k }
              : { delay: b.delay, type: 'spring', stiffness: 70, damping: 15, mass: 0.9, opacity: { delay: b.delay, duration: 0.3 } }
          }
        >
          <CaptionCard pair={b.pair} i={b.i} reduce={reduce} />
        </motion.div>
      ))}

      {/* the main window — what the phone became */}
      <motion.div
        className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ left: cx, top: cy }}
        initial={{ opacity: 0, scale: 0.35, y: -50, rotate: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
        transition={reduce ? { duration: 0.3 } : { delay: 0.85, type: 'spring', stiffness: 120, damping: 14 }}
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
function LanguageRail() {
  const reduce = useReducedMotion() ?? false;
  const list = [...CAPTION_LANGS, ...CAPTION_LANGS]; // doubled for a seamless loop
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 z-[5] flex w-[42%] max-w-[320px] flex-col border-l border-black/[0.06] bg-[#FAFAF8]/85 backdrop-blur-md sm:w-[30%]"
      style={{
        WebkitMaskImage: 'linear-gradient(to bottom, #000 0, #000 calc(100% - 300px), rgba(0,0,0,0.28) calc(100% - 220px), rgba(0,0,0,0.28) 100%)',
        maskImage: 'linear-gradient(to bottom, #000 0, #000 calc(100% - 300px), rgba(0,0,0,0.28) calc(100% - 220px), rgba(0,0,0,0.28) 100%)',
      }}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.3 } }}
      transition={{ delay: 0.9, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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

function SceneMrOneHook() {
  const reduce = useReducedMotion() ?? false;
  const k = reduce ? 0.3 : 1;
  const picked = MR_MESSAGES.filter((m) => m.pick);
  const payload = JSON.stringify(
    { excerpts: picked.map((m) => ({ from: m.from === 'You' ? 'you' : 'them', text: m.text })), stored: false },
    null,
    2
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] px-2">
      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_380px_minmax(0,1fr)] lg:gap-6">
        {/* left · on your phone, decrypted — you tick what he may see */}
        <div className="flex h-full min-h-[300px] flex-col rounded-[28px] border border-black/[0.07] bg-white p-5 shadow-[0_30px_80px_-50px_rgba(10,11,16,0.35)] sm:p-6">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-black/40">On your phone · decrypted</p>
          <ul className="mt-5 space-y-2.5">
            {MR_MESSAGES.map((m, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 * k, duration: 0.35 }}
                className={`flex items-start gap-2.5 ${m.from === 'You' ? 'flex-row-reverse text-right' : ''}`}
              >
                <motion.span
                  aria-hidden="true"
                  className="mt-2.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                  initial={{ backgroundColor: 'rgba(255,255,255,1)', borderColor: 'rgba(10,11,16,0.25)' }}
                  animate={m.pick ? { backgroundColor: '#1F3A6B', borderColor: '#1F3A6B' } : {}}
                  transition={{ delay: (0.8 + i * 0.25) * k, duration: 0.25 }}
                >
                  {m.pick && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: (0.85 + i * 0.25) * k, type: 'spring', stiffness: 320, damping: 15 }}>
                      <Check className="h-2.5 w-2.5 text-white" />
                    </motion.span>
                  )}
                </motion.span>
                <motion.span
                  className={`rounded-2xl px-3.5 py-2 text-[13px] font-light leading-snug ${m.from === 'You' ? 'text-white' : 'bg-black/[0.04] text-text'}`}
                  style={m.from === 'You' ? { background: '#1F3A6B' } : undefined}
                  initial={{ boxShadow: '0 0 0 0 rgba(255,143,199,0)' }}
                  animate={m.pick ? { boxShadow: '0 0 0 2px #FFFFFF, 0 0 0 3.5px #ff8fc7' } : { opacity: 0.55 }}
                  transition={{ delay: (0.8 + i * 0.25) * k, duration: 0.3 }}
                >
                  {m.text}
                </motion.span>
              </motion.li>
            ))}
          </ul>
          <p className="mt-auto flex items-center justify-center gap-1.5 pt-4 text-[10px] text-black/40">
            <EyeOff className="h-3 w-3" /> Unticked lines never leave your phone
          </p>
        </div>

        {/* centre · Mr OneHook, in full */}
        <div className="relative flex min-h-[300px] flex-col items-center justify-center gap-3">
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
            <AlienScanner size={108} hideTooltips />
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-black/40">Mr OneHook</p>
          </div>
        </div>

        {/* right · exactly what leaves your phone */}
        <div className="flex h-full min-h-[300px] flex-col rounded-[28px] p-5 font-mono text-[12px] text-white/80 sm:p-6" style={{ background: INK }}>
          <p className="mb-4 text-center font-sans text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">What leaves your phone</p>
          <motion.pre
            className="whitespace-pre-wrap leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 * k, duration: 0.5 }}
          >
            {payload}
          </motion.pre>
          <p className="mt-auto pt-4 font-sans text-[10px] leading-relaxed text-white/45">Used for this one reply, then forgotten — never stored, never logged.</p>
        </div>
      </div>

      {/* bottom · what Mr OneHook sends back */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.6 * k, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-6 flex max-w-3xl items-start gap-4 rounded-[24px] border border-[#ff8fc7]/40 bg-white p-5 text-left shadow-[0_24px_60px_-40px_rgba(255,105,180,0.6)]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(255,143,199,0.15)' }}>
          <Heart className="h-4 w-4" style={{ color: PINK }} fill={PINK} />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-black/40">From Mr OneHook</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-text">
            It sounds like you’re missing closeness, not just conversation. You could start with: <em>“I miss our talks — can we take a walk tonight, just us?”</em> 💛
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
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

function MascotPeeks() {
  const reduce = useReducedMotion() ?? false;
  const [scale, setScale] = useState(() => (typeof window === 'undefined' ? 1 : Math.min(1, window.innerWidth / 1280)));
  useEffect(() => {
    const onResize = () => setScale(Math.min(1, window.innerWidth / 1280));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // head points into the screen from each edge
  const turn = { top: 180, bottom: 0, left: 90, right: -90 } as const;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      {PEEKS.map((p, i) => {
        const size = Math.round(Math.max(70, p.size * (0.6 + 0.4 * scale)));

        if (p.kind === 'float') {
          return (
            <div key={i} className="absolute" style={{ left: p.x, top: p.y }}>
              <motion.div
                className="-translate-x-1/2 -translate-y-1/2"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: p.delay, type: 'spring', stiffness: 260, damping: 14 }}
              >
                <motion.div
                  animate={reduce ? undefined : { y: [0, -9, 0], rotate: [p.tilt - 3, p.tilt + 3, p.tilt - 3] }}
                  transition={reduce ? undefined : { duration: 4.5 + (i % 2), repeat: Infinity, ease: 'easeInOut' }}
                >
                  <AlienScanner size={size} hideTooltips bare />
                </motion.div>
              </motion.div>
            </div>
          );
        }

        // In the mascot's own frame (head up), the screen edge sits `inside` below its centre: the head
        // down to just under the smile shows, the body, arms and feet stay hidden.
        const inside = size * 0.13;
        const hidden = -size * 0.62;
        const anchor: CSSProperties =
          p.edge === 'top'
            ? { left: p.at, top: 0 }
            : p.edge === 'bottom'
              ? { left: p.at, top: '100%' }
              : p.edge === 'left'
                ? { left: 0, top: p.at }
                : { left: '100%', top: p.at };
        return (
          <div key={i} className="absolute h-0 w-0" style={anchor}>
            {/* turn so "up" for the mascot points into the screen */}
            <div style={{ transform: `rotate(${turn[p.edge]}deg)` }}>
              <motion.div
                className="absolute"
                style={{ width: size, height: size, left: -size / 2, top: -size / 2 }}
                initial={{ y: -hidden }}
                animate={{ y: -inside }}
                transition={reduce ? { duration: 0.3, delay: p.delay * 0.3 } : { delay: p.delay, type: 'spring', stiffness: 130, damping: 13, mass: 0.9 }}
              >
                <motion.div
                  style={{ transformOrigin: '50% 100%' }}
                  animate={reduce ? { rotate: p.tilt } : { rotate: [p.tilt - 3, p.tilt + 3, p.tilt - 3] }}
                  transition={reduce ? { duration: 0 } : { duration: 5 + (i % 3), repeat: Infinity, ease: 'easeInOut', delay: p.delay + 0.6 }}
                >
                  <AlienScanner size={size} hideTooltips bare />
                </motion.div>
              </motion.div>
            </div>
          </div>
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
  const reduce = useReducedMotion() ?? false;
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
          <motion.rect
            x={-200}
            y={-200}
            height={1000}
            initial={{ width: reduce ? 1600 : 0 }}
            animate={{ width: 1600 }}
            transition={reduce ? { duration: 0 } : { duration: 1.8, ease: [0.45, 0, 0.25, 1] }}
          />
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

/** Photo, video, voice note, file — each gets stamped with the same lock. */
function SceneSealed() {
  const items = [ImageIcon, Video, Mic, FileText];
  return (
    <div className="grid w-full max-w-[420px] grid-cols-2 gap-4">
      {items.map((Icon, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12 }}
          className="relative grid aspect-square place-items-center rounded-3xl border border-black/10 bg-white shadow-sm"
        >
          <Icon className="h-10 w-10 text-accent/70" />
          <motion.span
            initial={{ scale: 2.2, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.6 + i * 0.25, type: 'spring', stiffness: 260, damping: 15 }}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-accent text-white shadow"
          >
            <Lock className="h-4 w-4" />
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}

/** A heart that fills up — free forever, kept alive by people who care. */
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
            initial={{ y: 92 }}
            animate={{ y: reduce ? 30 : [92, 30, 38, 30] }}
            transition={reduce ? undefined : { duration: 3.2, ease: 'easeOut', times: [0, 0.7, 0.85, 1] }}
          />
        </g>
      </svg>
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
    line: 'iPad, Android, laptop — synced from your cloud, or one QR away.',
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
    line: 'Photos, videos, voice notes, files.',
    art: () => <SceneSealed />,
  },
  {
    title: <>Free forever. <Accent>Kept alive by you.</Accent></>,
    plain: 'Free forever. Kept alive by you.',
    line: 'No ads. No fees. Ever. Support is optional.',
    art: () => <SceneFree />,
  },
];


/** How long each screen's own animation runs (s) — drives the progress bar under the counter. */
const SCENE_SECONDS = [4.6, 8.9, 6.1, 5.4, 2.6, 3.2, 1.9, 1.8];

/** A thin bar under the counter that fills while the current screen's animation plays. */
function SceneProgress({ index, reduce }: { index: number; reduce: boolean }) {
  const seconds = SCENE_SECONDS[index] ?? 3;
  return (
    <div
      className="mx-auto mt-2 h-[3px] w-28 overflow-hidden rounded-full bg-black/10"
      role="progressbar"
      aria-label="This screen’s animation"
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        key={index}
        className="h-full rounded-full"
        style={{ background: PINK, transformOrigin: 'left center' }}
        initial={{ scaleX: reduce ? 1 : 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: reduce ? 0 : seconds, ease: 'linear' }}
      />
    </div>
  );
}

export function Messenger() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const storyRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: storyRef, offset: ['start start', 'end end'] });
  const [progress, setProgress] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', setProgress);

  const n = SCENES.length;
  // The scene on screen only moves forward once its own animation has finished (SCENE_SECONDS),
  // however hard you scroll: until then the page is held at the end of the current scene, and once
  // it's done the next scroll advances exactly one scene. Scrolling back is never held. With reduced
  // motion nothing is held, so no one can get stuck.
  const [index, setIndex] = useState(0);
  const shownRef = useRef(0);
  const doneAtRef = useRef(0);
  useEffect(() => {
    const el = storyRef.current;
    if (!el) return;
    const secs = (i: number) => (reduce ? 0 : SCENE_SECONDS[i] ?? 3);
    const geo = () => ({ top: el.getBoundingClientRect().top + window.scrollY, span: Math.max(1, el.offsetHeight - window.innerHeight) });
    const rawIndex = () => {
      const { top, span } = geo();
      const p = Math.min(0.9999, Math.max(0, (window.scrollY - top) / span));
      return Math.min(n - 1, Math.floor(p * n));
    };
    // last scroll position that still belongs to scene d
    const limitY = (d: number) => {
      const { top, span } = geo();
      return top + ((d + 1) / n) * span - 2;
    };
    const show = (i: number) => {
      shownRef.current = i;
      doneAtRef.current = performance.now() + secs(i) * 1000;
      setIndex(i);
    };
    const hold = (y: number) => window.scrollTo({ top: y, behavior: 'instant' });

    show(rawIndex());
    const onScroll = () => {
      const d = shownRef.current;
      const raw = rawIndex();
      if (raw < d) {
        show(raw);
        return;
      }
      if (window.scrollY <= limitY(d)) return;
      if (performance.now() < doneAtRef.current) {
        hold(limitY(d)); // animation still playing — stay on this scene
        return;
      }
      if (d < n - 1) {
        show(d + 1); // one scene at a time
        if (window.scrollY > limitY(d + 1)) hold(limitY(d + 1));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [n, reduce]);
  const scene = SCENES[index];
  const headerH = useHeaderHeight();
  // Last screen ("Free forever"): the heart blurs and fades into the background, and the words take
  // over the whole stage — large and centred — with the buttons staying in their usual place.
  const finale = index === n - 1;

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-text">
      <Seo {...ROUTE_SEO['/messenger']} path="/messenger" />
      <ProgressBar background={`linear-gradient(90deg, ${PINK}, #1F3A6B 50%, ${PINK})`} />
      <SiteHeader pageTitle="Messenger" />

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

        {/* One tall scroll track; the stage inside stays pinned while the story plays. */}
        <div ref={storyRef} className="relative" style={{ height: `${n * 95}vh` }}>
          <div
            className="sticky flex flex-col items-center overflow-hidden px-6 pb-5 pt-4 sm:pb-8 sm:pt-6"
            style={{ top: headerH, height: `calc(100svh - ${headerH}px)` }}
          >
            {/* screen 6: Mr OneHook peeking in from the edges */}
            <AnimatePresence>
              {index === 5 && (
                <Fragment key="peeks">
                  <PinkStrokes />
                  <MascotPeeks />
                </Fragment>
              )}
            </AnimatePresence>

            {/* screen 5: the supported-language list, rolling the full height of the screen */}
            <AnimatePresence>
              {index === 4 && (
                <Fragment key="rail">
                  <LanguageRail />
                </Fragment>
              )}
            </AnimatePresence>

            {/* soft backdrop glow that drifts with the story */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute h-[36rem] w-[36rem] rounded-full blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(255,143,199,0.16), transparent 65%)' }}
              animate={{ left: `${10 + (index % 2) * 40}%`, top: `${10 + (index % 3) * 12}%` }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />

            {/* 1 — the illustration is the hero. Screens 1–2 share one persistent phone stage (same
                key, so it never remounts); other screens scale down to fit the height that is left. */}
            <div aria-hidden="true" className={`relative z-0 flex min-h-0 w-full flex-1 ${index <= 4 || scene.fullScreen ? '' : scene.wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
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
                        ? { opacity: [1, 1, 0], scale: [1, 1, 1.18], filter: ['blur(0px)', 'blur(0px)', 'blur(18px)'] }
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
            <motion.div
              aria-hidden="true"
              className="relative z-10 mt-3 flex min-h-[92px] w-full max-w-3xl shrink-0 items-start justify-center text-center sm:mt-5 sm:min-h-[120px]"
              initial={false}
              animate={{ opacity: finale ? 0 : 1 }}
              transition={{ delay: finale ? 0.5 : 0, duration: 0.4 }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={index}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="font-mono text-[11px] text-black/30">
                    {String(index + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
                  </p>
                  <SceneProgress index={index} reduce={Boolean(reduce)} />
                  <p className="mt-1.5 text-2xl font-light leading-[1.08] tracking-[-0.02em] sm:mt-2 sm:text-5xl">{scene.title}</p>
                  <p className="mt-2 text-sm font-light text-black/55 sm:mt-3 sm:text-lg">{scene.line}</p>
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* finale: the words take the whole stage, centred (behind the buttons, above the faded heart) */}
            <AnimatePresence>
              {finale && (
                <motion.div
                  key="finale-words"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center justify-center px-6 text-center"
                  style={{ bottom: 'clamp(84px, 14vh, 130px)' }}
                  initial={{ opacity: 0, scale: 0.92, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, transition: { duration: 0.3 } }}
                  transition={{ delay: reduce ? 0 : 0.7, duration: reduce ? 0.2 : 0.9, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="font-mono text-xs text-black/30 sm:text-sm">
                    {String(n).padStart(2, '0')} / {String(n).padStart(2, '0')}
                  </p>
                  <SceneProgress index={index} reduce={Boolean(reduce)} />
                  <p className="mt-4 max-w-[16ch] font-light leading-[0.98] tracking-[-0.03em]" style={{ fontSize: 'clamp(3rem, 9vw, 8.5rem)' }}>
                    {scene.title}
                  </p>
                  <p className="mt-6 text-base font-light text-black/55 sm:text-2xl">{scene.line}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 3 — the same three buttons, always in the same place */}
            <motion.div
              className="relative z-10 mt-3 flex shrink-0 flex-wrap items-center justify-center gap-2 sm:mt-5 sm:gap-3"
              initial={false}
              animate={{ opacity: 1 }}
            >
              <a
                href={APP_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] sm:px-6 sm:py-3.5 sm:text-[11px] sm:tracking-[0.22em] text-white transition-opacity hover:opacity-90"
              >
                <Smartphone className="h-4 w-4" /> Get the app
              </a>
              <button
                type="button"
                onClick={() => navigate('/redeem')}
                {...trackProps(UiElement.LANDING_GET_STARTED)}
                className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] sm:px-6 sm:py-3.5 sm:text-[11px] sm:tracking-[0.22em] text-text/80 transition-colors hover:bg-black/[0.04]"
              >
                Start with an invite <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href={DONATE_HREF}
                {...trackProps(UiElement.LANDING_EMAIL_LINK, { value: 'other' })}
                className="inline-flex items-center gap-2 rounded-full border border-[#ff8fc7]/60 bg-[#ff8fc7]/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] sm:px-6 sm:py-3.5 sm:text-[11px] sm:tracking-[0.22em] text-text/80 transition-colors hover:bg-[#ff8fc7]/20"
              >
                <HandHeart className="h-4 w-4" style={{ color: PINK }} /> Support
              </a>
            </motion.div>

            {/* the continuous thread: one pink line that fills as the story unfolds */}
            <div aria-hidden="true" className="absolute right-6 top-1/2 hidden h-64 -translate-y-1/2 flex-col items-center sm:flex">
              <div className="relative h-full w-[2px] rounded-full bg-black/10">
                <div className="absolute left-0 top-0 w-full rounded-full" style={{ height: `${progress * 100}%`, background: PINK }} />
              </div>
              <div className="absolute inset-0 flex flex-col justify-between">
                {SCENES.map((s, i) => (
                  <span
                    key={s.plain}
                    className="-ml-[3px] h-2 w-2 rounded-full transition-all duration-300"
                    style={{ background: i <= index ? PINK : 'rgba(10,11,16,0.15)', transform: i === index ? 'scale(1.6)' : 'scale(1)' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* the heartbeat closer, shared with the Science page */}
        <Finale
          body="Every message locked end to end, every memory kept safe, on every screen you own — free, forever. All so the two of you can just talk."
          secondary="invite"
        />
      </main>

      <SiteFooter />
    </div>
  );
}
