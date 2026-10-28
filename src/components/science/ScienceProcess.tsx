import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  Clock3,
  Eye,
  Heart,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hideMrOneHook } from '../Chatbot/ChatbotWidget';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import {
  BRAND,
  ENGINE_META,
  ENGINE_ORDER,
  type ChapterDef,
  type ScienceChapterId,
} from './ScienceUi';
import { ROUTES, type EngineId, type SignalKind } from './science-model';

const EASE = [0.22, 1, 0.36, 1] as const;

const MOMENTS = [
  {
    id: 'view',
    label: 'A lingering look',
    detail: 'A pause can say more than a fast swipe.',
    Icon: Eye,
  },
  {
    id: 'swipe',
    label: 'A considered like',
    detail: 'Taking your time gives the moment more weight.',
    Icon: Heart,
  },
  {
    id: 'chat',
    label: 'A reply',
    detail: 'That you came back matters. The words stay private.',
    Icon: MessageCircle,
  },
] as const satisfies readonly { id: SignalKind; label: string; detail: string; Icon: typeof Eye }[];

const SIGNAL_CHOICES = [
  { id: 'view', label: 'View' },
  { id: 'swipe', label: 'Like' },
  { id: 'session', label: 'Session' },
  { id: 'chat', label: 'Reply' },
  { id: 'profile', label: 'Profile' },
  { id: 'ask', label: 'Ask' },
  { id: 'birth', label: 'Birth' },
] as const satisfies readonly { id: SignalKind; label: string }[];

const MIND_COPY: Record<EngineId, { question: string; answer: string }> = {
  engagement: {
    question: 'Did this moment matter?',
    answer: 'Notices the difference between a glance and genuine curiosity.',
  },
  rhythm: {
    question: 'How are you moving?',
    answer: 'Knows when the pace feels thoughtful, rushed or simply tired.',
  },
  meaning: {
    question: 'Who are you in words?',
    answer: 'Looks for people who sound at home in the same conversations.',
  },
  taste: {
    question: 'Who keeps catching your eye?',
    answer: 'Notices the kinds of people you choose, never the ones you pass.',
  },
  wish: {
    question: 'Who did you ask for?',
    answer: 'Carries what you tell Mr OneHook into the people he finds.',
  },
  tradition: {
    question: 'What do the old traditions say?',
    answer: 'Adds a gentle nudge from the birth details you choose to share.',
  },
};

const PATTERNS = [
  {
    id: 'early',
    label: 'Just arrived',
    title: 'One moment',
    body: 'Too soon to assume. OneHook waits.',
  },
  {
    id: 'steady',
    label: 'Taking time',
    title: 'A pattern appears',
    body: 'Thoughtful moments begin to point in the same direction.',
  },
  {
    id: 'ready',
    label: 'Ready to talk',
    title: 'The timing feels right',
    body: 'A good introduction can arrive when you are ready for it.',
  },
] as const;

const WISHES = [
  {
    id: 'reader',
    label: 'Calm reader',
    ask: 'Someone calm who reads and makes real plans.',
    result: 'A thoughtful reader who likes turning weekends into plans.',
  },
  {
    id: 'outside',
    label: 'Outdoorsy',
    ask: 'Someone outdoorsy who wants something real.',
    result: 'A person who would rather plan a trail than collect matches.',
  },
  {
    id: 'music',
    label: 'Live music',
    ask: 'Someone curious who loves live music.',
    result: 'A curious gig-goer with something to talk about afterwards.',
  },
] as const;

const PROMISES = [
  ['Words stay yours', 'Match chats are never read to match you.'],
  ['Only what is needed', 'Each moment goes only to the minds that need it.'],
  ['Built to forget', 'Your trail can disappear with you.'],
  ['A reason, always', 'Every introduction says who found them and why.'],
] as const;

interface ProcessState {
  active: ScienceChapterId;
  signal: SignalKind;
  mind: EngineId;
  pattern: (typeof PATTERNS)[number]['id'];
  wish: (typeof WISHES)[number]['id'];
  pulse: number;
  erasing: boolean;
}

interface SceneProps extends ProcessState {
  reduce: boolean;
  onJump: (chapter: ScienceChapterId) => void;
  onMind: (mind: EngineId) => void;
}

/* ── Diagram geometry (viewBox units) ─────────────────────────────────────────
 * The input lane runs left to right through A moment → Check → OneHook and nothing else sits on
 * it. Three minds sit above the centre (labels above them) and three below (labels below), so no
 * route ever crosses a label. The right side is the output lane: the pattern timeline in "Time"
 * and the introduction card in "Mr OneHook". Every label size below is the largest the geometry
 * was checked against, so text can grow on small screens without colliding. */
const VIEW_W = 660;
const VIEW_H = 470;
const SCENE_CX = 350;
const SCENE_CY = 220;
const RING = 58;
const MOMENT = { x: 60, y: 220 };
const CHECK = { x: 127, y: 220 };
const CARD = { x: 488, y: 150, w: 164, h: 140 };
const AXIS = { x0: 432, step: 30, count: 7 };
/** Centre of the lane between Check (its largest ring) and OneHook's ring. */
const SORT_X = (CHECK.x + 22 + SCENE_CX - RING - 6) / 2;
const BOUNDARY = { x: 2, y: 4, w: 656, h: 456, r: 120 };

const MIND_POSITIONS: Record<EngineId, { x: number; y: number }> = {
  tradition: { x: 180, y: 80 },
  engagement: { x: 350, y: 62 },
  rhythm: { x: 520, y: 80 },
  wish: { x: 180, y: 362 },
  meaning: { x: 350, y: 380 },
  taste: { x: 520, y: 362 },
};
const LABEL_ABOVE: ReadonlySet<EngineId> = new Set<EngineId>(['tradition', 'engagement', 'rhythm']);

/**
 * Sizes in viewBox units for the drawn scale `s` (rendered px per unit). Text aims for a legible
 * on-screen size but is clamped to the range the layout above was designed for.
 */
function sceneMetrics(s: number) {
  const k = s > 0 ? s : 1;
  const u = (px: number, min: number, max: number) => Math.min(max, Math.max(min, px / k));
  return {
    label: u(10, 10, 20),
    title: u(11.5, 13, 20),
    note: u(9, 10, 14),
    minor: u(8.5, 9, 16),
    cardHead: u(7.5, 8, 13),
    cardName: u(10.5, 11, 18),
    cardNote: u(9, 9, 15),
    node: u(7, 12, 15),
    moment: u(15, 26, 32),
    check: u(10, 18, 22),
    dot: u(3.5, 3.5, 6),
    showNotes: k >= 0.6,
  };
}

function routePath(engine: EngineId, end: number) {
  const p = MIND_POSITIONS[engine];
  const dx = p.x - SCENE_CX;
  const dy = p.y - SCENE_CY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const startX = SCENE_CX + ux * (RING + 4);
  const startY = SCENE_CY + uy * (RING + 4);
  const endX = p.x - ux * end;
  const endY = p.y - uy * end;
  return `M${startX} ${startY} C ${startX + dx * 0.3} ${startY + dy * 0.12}, ${endX - dx * 0.2} ${endY - dy * 0.18}, ${endX} ${endY}`;
}

/** Fits the 660×470 drawing plus its caption inside the box on both axes (never wider than
 * 760px), so the drawing and its caption stay together as one centred group. */
function useFittedWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const caption = captionRef.current;
    if (!el || !caption) return;
    const measure = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      const free = h - caption.getBoundingClientRect().height;
      const next = Math.floor(Math.max(0, Math.min(w, (free * VIEW_W) / VIEW_H, 760)));
      setWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(caption);
    return () => ro.disconnect();
  }, []);
  return { ref, captionRef, width };
}

const uppercase = { letterSpacing: '0.12em' } as const;

/** Stacked layout: the sticky diagram takes the drawing's natural height plus its caption, capped
 * so the step text below always keeps more than half of the screen. */
const SCENE_VARS = {
  '--scene-h': `min(44svh, calc((100vw - 2.5rem) * ${VIEW_H / VIEW_W} + 3rem))`,
} as CSSProperties;

/** One persistent diagram. Scrolling changes emphasis; it never remounts into another card. */
function ProcessScene({
  active,
  signal,
  mind,
  pattern,
  wish,
  pulse,
  erasing,
  reduce,
  onJump,
  onMind,
}: SceneProps) {
  const targets = ROUTES[signal];
  const selectedWish = WISHES.find((w) => w.id === wish) ?? WISHES[0];
  const patternIndex = PATTERNS.findIndex((p) => p.id === pattern);
  const sceneOpacity = erasing ? 0.08 : 1;
  const { ref: boxRef, captionRef, width: drawW } = useFittedWidth();
  // Looping packets run only while the diagram is on screen.
  const onScreen = useInView(boxRef);
  const animate = !reduce && onScreen;
  const m = sceneMetrics(drawW / VIEW_W);
  const nodeMax = m.node + 5;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const hit = (units: number) => Math.max(36, Math.round(units * 2 * (drawW / VIEW_W)));

  return (
    <div ref={boxRef} className="relative min-h-0 w-full flex-1" aria-live="polite">
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center">
        <div
          className="relative shrink-0"
          style={{ width: drawW || 'min(100%, 760px)', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute h-[75%] w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{
              left: pct(SCENE_CX, VIEW_W),
              top: pct(SCENE_CY, VIEW_H),
              background: `radial-gradient(circle, ${ENGINE_META[mind].soft}, transparent 68%)`,
            }}
          />
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={`OneHook process, focused on ${active}`}
          >
            <defs>
              <marker
                id="process-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 0 8 4 0 8Z" fill={BRAND.navy} fillOpacity="0.55" />
              </marker>
              <clipPath id="process-profile">
                <circle cx={CARD.x + CARD.w / 2} cy={CARD.y + 52} r="18" />
              </clipPath>
              {/* User-space units: a horizontal line has a zero-height bounding box, and a gradient in
                  bounding-box units would leave its stroke undrawn (only the arrowhead showed). */}
              <linearGradient
                id="process-line"
                gradientUnits="userSpaceOnUse"
                x1={MOMENT.x}
                y1={SCENE_CY}
                x2={SCENE_CX - RING}
                y2={SCENE_CY}
              >
                <stop offset="0" stopColor={ENGINE_META.engagement.color} />
                <stop offset="1" stopColor={ENGINE_META.meaning.color} />
              </linearGradient>
            </defs>

            <motion.g
              animate={{ opacity: sceneOpacity }}
              transition={{ duration: reduce ? 0 : 0.45 }}
            >
              {/* Input lane: A moment → Check → OneHook. Nothing else sits on this line. */}
              <path
                d={`M${MOMENT.x + m.moment + 2} ${SCENE_CY} H${SCENE_CX - RING - 6}`}
                fill="none"
                stroke="url(#process-line)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="3 6"
                markerEnd="url(#process-arrow)"
              />

              {/* A moment. */}
              <motion.g
                initial={false}
                animate={{ opacity: active === 'signal' ? 1 : 0.55 }}
                transition={{ duration: 0.3 }}
              >
                <circle
                  cx={MOMENT.x}
                  cy={MOMENT.y}
                  r={m.moment}
                  fill="#FFFFFF"
                  stroke={ENGINE_META.engagement.deep}
                  strokeOpacity="0.5"
                />
                <circle
                  cx={MOMENT.x}
                  cy={MOMENT.y}
                  r={m.moment * 0.27}
                  fill={ENGINE_META.engagement.color}
                />
                <text
                  x={MOMENT.x}
                  y={MOMENT.y + m.moment + 6 + m.title * 0.72}
                  textAnchor="middle"
                  fill={BRAND.ink}
                  fontSize={m.title}
                  fontWeight="600"
                >
                  A moment
                </text>
                {m.showNotes && (
                  <text
                    x={MOMENT.x}
                    y={MOMENT.y + m.moment + 6 + m.title * 0.72 + 6 + m.note}
                    textAnchor="middle"
                    fill="rgba(10,11,16,0.48)"
                    fontSize={m.note}
                  >
                    quietly noticed
                  </text>
                )}
              </motion.g>

              {/* Checked on the way in. */}
              <motion.g
                initial={false}
                animate={{ opacity: active === 'journey' ? 1 : 0.42 }}
                transition={{ duration: 0.3 }}
              >
                <circle
                  cx={CHECK.x}
                  cy={CHECK.y}
                  r={m.check}
                  fill="#FFFFFF"
                  stroke="rgba(10,11,16,0.24)"
                />
                <path
                  d={`M${CHECK.x - m.check * 0.4} ${CHECK.y} l${m.check * 0.25} ${m.check * 0.25} l${m.check * 0.55} -${m.check * 0.6}`}
                  fill="none"
                  stroke={BRAND.navy}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text
                  x={CHECK.x}
                  y={CHECK.y - m.check - 8}
                  textAnchor="middle"
                  fill="rgba(10,11,16,0.55)"
                  fontSize={m.minor}
                  fontWeight="600"
                  style={uppercase}
                >
                  CHECK
                </text>
              </motion.g>

              {/* The fixed centre. Its label sits under the input lane, clear of every route. */}
              <circle
                cx={SCENE_CX}
                cy={SCENE_CY}
                r={RING}
                fill="#FFFFFF"
                stroke="rgba(10,11,16,0.09)"
              />
              <circle
                cx={SCENE_CX}
                cy={SCENE_CY}
                r={RING - 14}
                fill="#FFFFFF"
                stroke="rgba(10,11,16,0.18)"
              />
              <image href={BRAND.logo} x={SCENE_CX - 34} y={SCENE_CY - 34} width="68" height="68" />
              {/* What happens on the way in: OneHook sorts the moment for the minds that need it.
                  Centred on the lane between Check and the centre, the word above and its note below. */}
              <text
                x={SORT_X}
                y={SCENE_CY - 10 - m.minor * 0.3}
                textAnchor="middle"
                fill="rgba(10,11,16,0.5)"
                fontSize={m.minor}
                fontWeight="600"
                style={uppercase}
              >
                SORTED
              </text>
              {m.showNotes && (
                <text
                  x={SORT_X}
                  y={SCENE_CY + 12 + m.note * 0.8}
                  textAnchor="middle"
                  fill="rgba(10,11,16,0.45)"
                  fontSize={m.note}
                >
                  for the right minds
                </text>
              )}

              {/* Six minds stay spatially stable: three above the centre, three below. */}
              {ENGINE_ORDER.map((id) => {
                const p = MIND_POSITIONS[id];
                const listens = targets.includes(id);
                const selected =
                  active === 'journey'
                    ? listens
                    : active === 'minds'
                      ? mind === id
                      : active === 'time'
                        ? id === 'engagement' || id === 'rhythm'
                        : active === 'mr-onehook'
                          ? id === 'taste' || id === 'wish'
                          : false;
                const above = LABEL_ABOVE.has(id);
                return (
                  <motion.g
                    key={id}
                    initial={false}
                    animate={{
                      opacity:
                        active === 'mr-onehook' && !selected
                          ? 0.28
                          : active === 'minds' && mind !== id
                            ? 0.42
                            : 1,
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.path
                      d={routePath(id, nodeMax + 3)}
                      fill="none"
                      stroke={selected ? ENGINE_META[id].deep : 'rgba(10,11,16,0.08)'}
                      strokeWidth={selected ? 1.8 : 1}
                      strokeDasharray={selected ? undefined : '2 7'}
                      markerEnd={selected ? 'url(#process-arrow)' : undefined}
                      initial={false}
                      animate={{ opacity: active === 'signal' ? 0.2 : selected ? 0.9 : 0.35 }}
                    />
                    <motion.circle
                      cx={p.x}
                      cy={p.y}
                      r={m.node}
                      fill={selected ? ENGINE_META[id].soft : '#FFFFFF'}
                      stroke={selected ? ENGINE_META[id].deep : 'rgba(10,11,16,0.18)'}
                      initial={false}
                      animate={{ r: selected ? nodeMax : m.node }}
                      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                    />
                    <motion.circle
                      cx={p.x}
                      cy={p.y}
                      r={m.node * 0.27}
                      fill={selected ? ENGINE_META[id].deep : '#A8ADB5'}
                      initial={false}
                      animate={{ r: (selected ? 0.36 : 0.27) * m.node }}
                    />
                    <text
                      x={p.x}
                      y={above ? p.y - nodeMax - 6 : p.y + nodeMax + 6 + m.label * 0.72}
                      textAnchor="middle"
                      fill={selected ? ENGINE_META[id].deep : 'rgba(10,11,16,0.5)'}
                      fontSize={m.label}
                      fontWeight="600"
                      style={uppercase}
                    >
                      {ENGINE_META[id].name.toUpperCase()}
                    </text>
                  </motion.g>
                );
              })}

              {/* Time: moments build into a pattern along the output lane. */}
              <motion.g
                initial={false}
                animate={{ opacity: active === 'time' ? 1 : 0 }}
                transition={{ duration: 0.35 }}
              >
                <path
                  d={`M${SCENE_CX + RING + 4} ${SCENE_CY} H${AXIS.x0 + AXIS.step * (AXIS.count - 1)}`}
                  stroke="rgba(10,11,16,0.12)"
                  strokeWidth="1"
                />
                {Array.from({ length: AXIS.count }, (_, i) => (
                  <motion.circle
                    key={i}
                    cx={AXIS.x0 + i * AXIS.step}
                    cy={SCENE_CY}
                    r={m.dot}
                    fill={i <= patternIndex * 2 + 2 ? ENGINE_META.rhythm.deep : '#D9DCE1'}
                    initial={false}
                    animate={{ r: i === patternIndex * 2 + 2 ? m.dot * 1.9 : m.dot }}
                  />
                ))}
                <text
                  x={AXIS.x0 - 7}
                  y={SCENE_CY - 14}
                  fill="rgba(10,11,16,0.42)"
                  fontSize={m.minor}
                  fontWeight="600"
                  style={uppercase}
                >
                  ONE MOMENT
                </text>
                <text
                  x={AXIS.x0 + AXIS.step * (AXIS.count - 1) + 7}
                  y={SCENE_CY + m.dot * 1.9 + 6 + m.minor * 0.8}
                  textAnchor="end"
                  fill={ENGINE_META.rhythm.deep}
                  fontSize={m.minor}
                  fontWeight="600"
                  style={uppercase}
                >
                  A PATTERN
                </text>
              </motion.g>

              {/* Mr OneHook turns a request into a visible, explained introduction. */}
              <motion.g
                initial={false}
                animate={{
                  opacity: active === 'mr-onehook' ? 1 : 0,
                  x: active === 'mr-onehook' ? 0 : 18,
                }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <path
                  d={`M${SCENE_CX + RING + 4} ${SCENE_CY} H${CARD.x - 3}`}
                  fill="none"
                  stroke={ENGINE_META.wish.deep}
                  strokeWidth="2"
                  markerEnd="url(#process-arrow)"
                />
                <rect
                  x={CARD.x}
                  y={CARD.y}
                  width={CARD.w}
                  height={CARD.h}
                  rx="20"
                  fill="#FFFFFF"
                  stroke={ENGINE_META.wish.color}
                />
                <text
                  x={CARD.x + CARD.w / 2}
                  y={CARD.y + 14 + m.cardHead * 0.72}
                  textAnchor="middle"
                  fill={ENGINE_META.wish.deep}
                  fontSize={m.cardHead}
                  fontWeight="700"
                  style={uppercase}
                >
                  FOUND FOR YOU
                </text>
                <image
                  href="/media/profile-demo/profile-male-1.jpg"
                  x={CARD.x + CARD.w / 2 - 18}
                  y={CARD.y + 34}
                  width="36"
                  height="36"
                  preserveAspectRatio="xMidYMid slice"
                  clipPath="url(#process-profile)"
                />
                <text
                  x={CARD.x + CARD.w / 2}
                  y={CARD.y + 78 + m.cardName * 0.72}
                  textAnchor="middle"
                  fill={BRAND.ink}
                  fontSize={m.cardName}
                  fontWeight="600"
                >
                  Aarav · 29
                </text>
                <text
                  x={CARD.x + CARD.w / 2}
                  y={CARD.y + CARD.h - 14}
                  textAnchor="middle"
                  fill={ENGINE_META.wish.deep}
                  fontSize={m.cardNote}
                  fontWeight="600"
                >
                  {selectedWish.label}
                </text>
              </motion.g>

              {/* Privacy is the boundary around everything, not another destination. */}
              <motion.g
                initial={false}
                animate={{ opacity: active === 'promises' ? 1 : 0 }}
                transition={{ duration: 0.35 }}
              >
                <rect
                  x={BOUNDARY.x}
                  y={BOUNDARY.y}
                  width={BOUNDARY.w}
                  height={BOUNDARY.h}
                  rx={BOUNDARY.r}
                  fill="none"
                  stroke={BRAND.navy}
                  strokeOpacity="0.45"
                  strokeWidth="1.5"
                  strokeDasharray="4 8"
                />
                <rect
                  x={SCENE_CX - m.minor * 6}
                  y={BOUNDARY.y + BOUNDARY.h - m.minor * 0.8}
                  width={m.minor * 12}
                  height={m.minor * 1.6}
                  rx={m.minor * 0.8}
                  fill={BRAND.mist}
                />
                <text
                  x={SCENE_CX}
                  y={BOUNDARY.y + BOUNDARY.h + m.minor * 0.36}
                  textAnchor="middle"
                  fill={BRAND.navy}
                  fontSize={m.minor}
                  fontWeight="700"
                  style={uppercase}
                >
                  YOUR BOUNDARY
                </text>
              </motion.g>

              {/* A single packet makes the routing tangible. */}
              {animate && (active === 'signal' || active === 'journey') && (
                <motion.circle
                  key={`${signal}-${pulse}-${active}`}
                  r="5"
                  fill={ENGINE_META.engagement.deep}
                  stroke={ENGINE_META.engagement.color}
                  strokeOpacity="0.35"
                  strokeWidth="6"
                  initial={{ cx: MOMENT.x, cy: SCENE_CY, opacity: 0 }}
                  animate={{
                    cx: [MOMENT.x, CHECK.x, SCENE_CX],
                    cy: [SCENE_CY, SCENE_CY, SCENE_CY],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 1.25,
                    repeat: Infinity,
                    repeatDelay: 0.6,
                    ease: 'easeInOut',
                  }}
                />
              )}
              {animate &&
                active === 'journey' &&
                targets.map((id) => {
                  const p = MIND_POSITIONS[id];
                  return (
                    <motion.circle
                      key={`${signal}-${pulse}-${id}`}
                      r="4"
                      fill={ENGINE_META[id].deep}
                      initial={{ cx: SCENE_CX, cy: SCENE_CY, opacity: 0 }}
                      animate={{ cx: p.x, cy: p.y, opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.9,
                        delay: 1.05,
                        repeat: Infinity,
                        repeatDelay: 0.95,
                        ease: 'easeInOut',
                      }}
                    />
                  );
                })}
            </motion.g>

            {erasing && (
              <motion.text
                x={SCENE_CX}
                y={SCENE_CY + RING + 8 + m.title * 0.72}
                textAnchor="middle"
                fill={BRAND.navy}
                fontSize={m.title}
                fontWeight="600"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: reduce ? 0 : 1.6 }}
              >
                Forgotten
              </motion.text>
            )}
          </svg>

          {/* Transparent HTML controls make the drawn nodes directly operable by mouse, touch and
              keyboard. They are sized from the drawn scale so neighbouring targets never stack. */}
          <button
            type="button"
            aria-label="Go to A moment"
            title="A moment"
            onClick={() => onJump('signal')}
            {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' })}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent transition-colors hover:bg-[#A2525E]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A2525E]/40"
            style={{
              left: pct(MOMENT.x, VIEW_W),
              top: pct(MOMENT.y, VIEW_H),
              width: hit(m.moment + 2),
              height: hit(m.moment + 2),
            }}
          />
          <button
            type="button"
            aria-label="Go to The journey"
            title="Follow the journey"
            onClick={() => onJump('journey')}
            {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' })}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent transition-colors hover:bg-[#1F3A6B]/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A6B]/30"
            style={{
              left: pct(SCENE_CX, VIEW_W),
              top: pct(SCENE_CY, VIEW_H),
              width: hit(RING),
              height: hit(RING),
            }}
          />
          {ENGINE_ORDER.map((id) => {
            const p = MIND_POSITIONS[id];
            return (
              <button
                key={`control-${id}`}
                type="button"
                aria-label={`Explore ${ENGINE_META[id].name}`}
                title={`Explore ${ENGINE_META[id].name}`}
                onClick={() => onMind(id)}
                {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_tab' })}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent transition-colors hover:bg-black/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                style={{
                  left: pct(p.x, VIEW_W),
                  top: pct(p.y, VIEW_H),
                  width: hit(nodeMax + 4),
                  height: hit(nodeMax + 4),
                }}
              />
            );
          })}
          {active === 'mr-onehook' && (
            <button
              type="button"
              aria-label="Explore the introduction"
              title="A considered introduction"
              onClick={() => onJump('mr-onehook')}
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' })}
              className="absolute rounded-[16px] bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3F86]/30"
              style={{
                left: pct(CARD.x, VIEW_W),
                top: pct(CARD.y, VIEW_H),
                width: pct(CARD.w, VIEW_W),
                height: pct(CARD.h, VIEW_H),
              }}
            />
          )}
        </div>

        <p
          ref={captionRef}
          // Centred on the OneHook logo (not the box), like "Your boundary": as wide as the logo's
          // distance to the nearer edge allows, then shifted onto the logo's x.
          style={
            drawW
              ? {
                  width: (2 * Math.min(SCENE_CX, VIEW_W - SCENE_CX) * drawW) / VIEW_W,
                  transform: `translateX(${(SCENE_CX / VIEW_W - 0.5) * drawW}px)`,
                }
              : undefined
          }
          className="pointer-events-none flex min-h-[2.75rem] w-full items-start justify-center px-2 pb-2 pt-1 text-center text-[10px] font-semibold uppercase leading-relaxed tracking-[0.24em] text-black/40"
        >
          {active === 'signal' && 'It begins with one moment · tap any node to explore'}
          {active === 'journey' && 'Only the right minds listen'}
          {active === 'minds' && `${ENGINE_META[mind].name} · ${MIND_COPY[mind].question}`}
          {active === 'time' && PATTERNS[patternIndex].title}
          {active === 'mr-onehook' && `“${selectedWish.ask}”`}
          {active === 'promises' && 'You remain in control'}
        </p>
      </div>
    </div>
  );
}

function FlatChoices<T extends string>({
  label,
  options,
  value,
  onChange,
  color = BRAND.navy,
  trackValue = 'science_tab',
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  color?: string;
  trackValue?: 'science_tab' | 'science_signal_kind';
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap gap-x-5 gap-y-2 border-b border-black/[0.08]"
    >
      {options.map((option) => {
        const on = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.id)}
            {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: trackValue })}
            className="relative min-h-11 pb-3 pt-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-black/40 transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
            style={{ color: on ? color : undefined }}
          >
            {option.label}
            <motion.span
              aria-hidden="true"
              className="absolute inset-x-0 -bottom-px h-0.5 origin-left"
              style={{ background: color }}
              animate={{ scaleX: on ? 1 : 0 }}
            />
          </button>
        );
      })}
    </div>
  );
}

function ProcessStep({
  chapter,
  eyebrow,
  title,
  body,
  active,
  onEnter,
  children,
}: {
  chapter: ChapterDef;
  eyebrow: string;
  title: ReactNode;
  body: string;
  active: boolean;
  onEnter: (id: ScienceChapterId) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  // A section is current while it covers the middle of the screen. A visible-area ratio would never
  // trigger for steps taller than the viewport (short landscape screens, long final step).
  const inView = useInView(ref, { margin: '-50% 0px -49% 0px' });
  useEffect(() => {
    if (inView) onEnter(chapter.id);
  }, [chapter.id, inView, onEnter]);

  return (
    <section
      ref={ref}
      id={chapter.id}
      data-chapter={chapter.id}
      aria-labelledby={`${chapter.id}-title`}
      className="relative flex min-h-[100svh] scroll-mt-[69px] items-start pb-16 pt-[calc(var(--scene-h)+2.5rem)] split:min-h-[82vh] split:scroll-mt-24 split:items-center split:py-24"
    >
      <motion.div
        className="w-full"
        initial={false}
        animate={{ opacity: active ? 1 : 0.35, x: active ? 0 : 12 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-black/30">{chapter.number}</span>
          <span className="h-px flex-1 bg-black/10" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-black/40">
            {eyebrow}
          </span>
        </div>
        <h2
          id={`${chapter.id}-title`}
          className="mt-7 max-w-xl text-4xl font-light leading-[1.05] tracking-[-0.035em] sm:text-5xl"
        >
          {title}
        </h2>
        <p className="mt-4 max-w-lg text-base font-light leading-relaxed text-black/55">{body}</p>
        <div className="mt-8">{children}</div>
      </motion.div>
    </section>
  );
}

export function ScienceProcess({ chapters }: { chapters: readonly ChapterDef[] }) {
  const reduce = useReducedMotion() ?? false;
  const navigate = useNavigate();
  const [state, setState] = useState<ProcessState>({
    active: 'signal',
    signal: 'view',
    mind: 'engagement',
    pattern: 'steady',
    wish: 'reader',
    pulse: 0,
    erasing: false,
  });

  const setActive = useCallback(
    (active: ScienceChapterId) => setState((s) => (s.active === active ? s : { ...s, active })),
    []
  );
  const jump = useCallback(
    (active: ScienceChapterId) => {
      setActive(active);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document
        .getElementById(active)
        ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    },
    [setActive]
  );
  const focusMind = useCallback((mind: EngineId) => {
    setState((s) => ({ ...s, active: 'minds', mind }));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('minds')
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, []);
  const selectSignal = (signal: SignalKind) =>
    setState((s) => ({ ...s, signal, pulse: s.pulse + 1 }));
  const eraseTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (eraseTimer.current !== null) window.clearTimeout(eraseTimer.current);
    },
    []
  );
  const erase = () => {
    setState((s) => ({ ...s, erasing: true }));
    if (eraseTimer.current !== null) window.clearTimeout(eraseTimer.current);
    eraseTimer.current = window.setTimeout(
      () => setState((s) => ({ ...s, erasing: false })),
      reduce ? 80 : 1750
    );
  };

  const activeMoment = MOMENTS.find((m) => m.id === state.signal) ?? MOMENTS[0];
  const activePattern = PATTERNS.find((p) => p.id === state.pattern) ?? PATTERNS[1];
  const activeWish = WISHES.find((w) => w.id === state.wish) ?? WISHES[0];
  const targetNames = useMemo(
    () => ROUTES[state.signal].map((id) => ENGINE_META[id].name).join(' · '),
    [state.signal]
  );

  return (
    // The process sits on the landing page's "How it works" ground, rising on the same curved edge,
    // so it reads as a new chapter after the white story index.
    <div className="relative" style={{ background: BRAND.mist }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-12 -translate-y-full sm:h-16 lg:h-20"
        style={{ background: BRAND.mist, clipPath: 'ellipse(100% 100% at 50% 100%)' }}
      />
      <div
        {...hideMrOneHook}
        style={SCENE_VARS}
        className="relative mx-auto max-w-[1380px] overflow-x-clip px-5 sm:px-8 split:grid split:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] split:gap-12 lg:gap-24 lg:px-12"
      >
        <div className="sticky top-[69px] z-20 flex h-[var(--scene-h)] flex-col border-b border-black/[0.06] bg-[#EEF0F3] split:top-20 split:h-[calc(100svh-6rem)] split:border-b-0 split:bg-transparent split:py-4">
          <ProcessScene {...state} reduce={reduce} onJump={jump} onMind={focusMind} />
        </div>

        <div className="relative z-10 -mt-[var(--scene-h)] split:mt-0">
          <ProcessStep
            chapter={chapters[0]}
            eyebrow="A moment"
            title={
              <>
                You know the feeling: one profile makes you{' '}
                <em className="font-serif text-[#1F3A6B]">pause</em>
              </>
            }
            body="Before you decide, your attention has already said something. OneHook notices the moment, never judges the person."
            active={state.active === 'signal'}
            onEnter={setActive}
          >
            <FlatChoices
              label="Choose a moment"
              options={MOMENTS}
              value={activeMoment.id}
              onChange={selectSignal}
              color={ENGINE_META.engagement.deep}
              trackValue="science_signal_kind"
            />
            <div className="mt-6 flex items-start gap-3 text-sm font-light leading-relaxed text-black/60">
              <activeMoment.Icon
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: ENGINE_META.engagement.deep }}
                aria-hidden="true"
              />
              <p>{activeMoment.detail}</p>
            </div>
          </ProcessStep>

          <ProcessStep
            chapter={chapters[1]}
            eyebrow="The journey"
            title={
              <>
                Your moments should never become{' '}
                <em className="font-serif text-[#1F3A6B]">noise</em>
              </>
            }
            body="Each one is checked, kept in order and heard only by the minds that can use it."
            active={state.active === 'journey'}
            onEnter={setActive}
          >
            <FlatChoices
              label="Choose a signal"
              options={SIGNAL_CHOICES}
              value={state.signal}
              onChange={selectSignal}
              color={ENGINE_META.rhythm.deep}
              trackValue="science_signal_kind"
            />
            <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-black/40">
              Heard by <span className="text-black/70">{targetNames}</span>
            </p>
          </ProcessStep>

          <ProcessStep
            chapter={chapters[2]}
            eyebrow="Six minds"
            title={
              <>
                No giant algorithm gets to <em className="font-serif text-[#1F3A6B]">define you</em>
              </>
            }
            body="Six small minds ask six small questions. Together, they make one more considered introduction."
            active={state.active === 'minds'}
            onEnter={setActive}
          >
            <FlatChoices
              label="Choose a mind"
              options={ENGINE_ORDER.map((id) => ({ id, label: ENGINE_META[id].name }))}
              value={state.mind}
              onChange={(mind) => setState((s) => ({ ...s, mind }))}
              color={ENGINE_META[state.mind].deep}
            />
            <p className="mt-6 text-xl font-light">{MIND_COPY[state.mind].question}</p>
            <p className="mt-2 max-w-md text-sm font-light leading-relaxed text-black/55">
              {MIND_COPY[state.mind].answer}
            </p>
          </ProcessStep>

          <ProcessStep
            chapter={chapters[3]}
            eyebrow="Time & intent"
            title={
              <>
                Readiness has a <em className="font-serif text-[#1F3A6B]">rhythm</em>
              </>
            }
            body="OneHook waits for a pattern before it makes a suggestion, because the right introduction at the wrong time is still wrong."
            active={state.active === 'time'}
            onEnter={setActive}
          >
            <FlatChoices
              label="Move through time"
              options={PATTERNS}
              value={state.pattern}
              onChange={(pattern) => setState((s) => ({ ...s, pattern }))}
              color={ENGINE_META.rhythm.deep}
            />
            <div className="mt-6 flex items-start gap-3">
              <Clock3
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: ENGINE_META.rhythm.deep }}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-black/70">{activePattern.title}</p>
                <p className="mt-1 text-sm font-light leading-relaxed text-black/55">
                  {activePattern.body}
                </p>
              </div>
            </div>
          </ProcessStep>

          <ProcessStep
            chapter={chapters[4]}
            eyebrow="Mr OneHook"
            title={
              <>
                Say what matters. See <em className="font-serif text-[#1F3A6B]">why they fit</em>
              </>
            }
            body="Tell Mr OneHook who you hope to meet. He carries the useful part into Discover, leaves sensitive traits out, and explains the introduction."
            active={state.active === 'mr-onehook'}
            onEnter={setActive}
          >
            <FlatChoices
              label="Ask Mr OneHook"
              options={WISHES}
              value={state.wish}
              onChange={(wish) => setState((s) => ({ ...s, wish }))}
              color={ENGINE_META.wish.deep}
            />
            <div className="mt-6 flex items-start gap-3">
              <Sparkles
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: ENGINE_META.wish.deep }}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-light leading-relaxed text-black/65">
                  “{activeWish.ask}”
                </p>
                <p
                  className="mt-2 text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: ENGINE_META.wish.deep }}
                >
                  He looks for
                </p>
                <p className="mt-1 text-sm font-light leading-relaxed text-black/55">
                  {activeWish.result}
                </p>
              </div>
            </div>
          </ProcessStep>

          <ProcessStep
            chapter={chapters[5]}
            eyebrow="Promises"
            title={
              <>
                Intelligence should <em className="font-serif text-[#1F3A6B]">earn your trust</em>
              </>
            }
            body="The boundaries are part of OneHook itself: your words stay yours, every introduction has a reason, and your trail can disappear with you."
            active={state.active === 'promises'}
            onEnter={setActive}
          >
            <ul className="divide-y divide-black/[0.07] border-y border-black/[0.08]">
              {PROMISES.map(([title, body]) => (
                <li key={title} className="flex gap-4 py-4">
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#1F3A6B]"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-semibold text-black/75">{title}</p>
                    <p className="mt-1 text-sm font-light leading-relaxed text-black/50">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={erase}
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_erasure' })}
              className="mt-7 inline-flex min-h-11 items-center gap-3 border-b border-[#1F3A6B] pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#1F3A6B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A6B]/30"
            >
              <Activity className="h-4 w-4" aria-hidden="true" /> Show how forgetting works
            </button>

            <div className="mt-12 border-t border-black/[0.09] pt-8">
              <p className="max-w-md text-2xl font-light leading-tight tracking-[-0.02em] text-black/80">
                Dating can feel this <em className="font-serif text-[#1F3A6B]">considered</em>.
              </p>
              <p className="mt-3 max-w-md text-sm font-light leading-relaxed text-black/50">
                Spend less time decoding the app, and more time getting to know one person.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/#get-app')}
                  {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
                  className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#0A0B10] px-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A6B]/40 focus-visible:ring-offset-2"
                >
                  Get OneHook <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/#philosophy')}
                  {...trackProps(UiElement.LANDING_HOME_LINK)}
                  className="inline-flex min-h-12 items-center rounded-full border border-black/15 px-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#0A0B10] transition-[transform,border-color] hover:-translate-y-0.5 hover:border-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A6B]/40 focus-visible:ring-offset-2"
                >
                  Our philosophy
                </button>
              </div>
            </div>
          </ProcessStep>
        </div>
      </div>
    </div>
  );
}
