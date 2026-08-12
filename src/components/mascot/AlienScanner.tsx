/**
 * OneHook Mascot
 *
 * A friendly pink egg mascot that sits next to content and waves for engagement.
 * - Statically placed (no floating / teleporting).
 * - Right hand waves on a gentle loop.
 * - Eyes softly track the cursor.
 * - Gentle breathing + subtly animated mouth for life.
 *
 * When an `onClick` handler is supplied the mascot becomes interactive: hovering
 * (or focusing it via keyboard) makes it look excited — a faster, bigger wave,
 * an eager bounce, wider eyes, a broader smile and sparkles — and shows a
 * tooltip inviting the visitor to click. Pass `forceExcited` to hold that state
 * (e.g. while the video the mascot opened is still on screen).
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Instagram, Youtube } from 'lucide-react';
import { AiSparkle } from './AiSparkle';

interface AlienScannerProps {
  /** Fixed size in pixels (square). Omit to let the container control size (e.g. h-full). */
  size?: number;
  /** Body color */
  primaryColor?: string;
  /** Eye (iris) color */
  scanColor?: string;
  /** Optional wrapper className */
  className?: string;
  /** Optional wrapper style */
  style?: React.CSSProperties;
  /** Makes the mascot interactive (excited on hover + clickable). */
  onClick?: () => void;
  /** Tooltip / accessible label shown when the mascot is hovered or focused. */
  hoverLabel?: string;
  /**
   * Keeps the mascot in its excited state regardless of hover/focus — used while
   * the video it opened is on screen, so it stays lively (and keeps showing its
   * message) for as long as that view is in use.
   */
  forceExcited?: boolean;
  /** Hides the built-in tooltips so they can be rendered elsewhere */
  hideTooltips?: boolean;
}

export const AlienScanner: React.FC<AlienScannerProps> = ({
  size,
  primaryColor = '#ff69b4',
  scanColor = '#0052CC',
  className,
  style,
  onClick,
  hoverLabel = 'Click to watch me explain more about onehook.club',
  forceExcited = false,
  hideTooltips = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerFocusRef = useRef(false);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const interactive = typeof onClick === 'function';
  const excited = interactive && (isHovered || isFocused || forceExcited);

  // Soft eye tracking toward the cursor (no body movement).
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.38; // eyes sit in the upper third
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const maxOffset = 3; // in SVG user units
      const mag = Math.min(dist / 90, 1) * maxOffset;
      setEyeOffset({ x: (dx / dist) * mag, y: (dy / dist) * mag });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Waving keyframes for the raised arm (rotate around the shoulder).
  // Excited: bigger sweep, faster, no pause between waves.
  const waveAnimation = excited
    ? { rotate: [0, -36, -6, -36, -6, -36, 0] }
    : { rotate: [0, -20, -4, -20, -4, 0] };
  const waveTransition = excited
    ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' as const }
    : { duration: 1.8, repeat: Infinity, repeatDelay: 1.1, ease: 'easeInOut' as const };

  const mascotSvg = (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 120 120"
      preserveAspectRatio="xMidYMax meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Soft ground shadow */}
      <ellipse cx="60" cy="114" rx="26" ry="4" fill="#000000" opacity={0.12} />

      {/* Static limbs (left arm + legs) */}
      <g stroke={primaryColor} strokeLinecap="round" fill="none">
        <motion.g
          style={{ transformOrigin: '31px 64px' }}
          animate={excited ? { rotate: [0, 14, 0] } : { rotate: 0 }}
          transition={
            excited ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }
          }
        >
          <path d="M31 64 Q20 70 12 74" strokeWidth="9" />
          {/* Paint bucket */}
          <g transform="translate(12, 74)">
            {/* Handle */}
            <path d="M -4 0 C -4 -6, 4 -6, 4 0" fill="none" strokeWidth="1.5" />
            {/* Bucket Body */}
            <path d="M -4 0 L 4 0 L 3 8 L -3 8 Z" fill="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Paint inside bucket */}
            <path d="M -3.5 1 L 3.5 1 L 3 3 L -3 3 Z" fill={primaryColor} stroke="none" />
          </g>
        </motion.g>
        <path d="M50 92 L49 108" strokeWidth="9" />
        <path d="M70 92 L71 108" strokeWidth="9" />
      </g>
      <g fill={primaryColor}>
        <motion.circle
          cx="12"
          cy="74"
          r="5.5"
          style={{ transformOrigin: '31px 64px' }}
          animate={excited ? { rotate: [0, 14, 0] } : { rotate: 0 }}
          transition={
            excited ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }
          }
        />
        <ellipse cx="45" cy="109" rx="7" ry="4.5" />
        <ellipse cx="75" cy="109" rx="7" ry="4.5" />
      </g>

      {/* Right arm (holding paint brush) */}
      <motion.g
        style={{ transformOrigin: '90px 52px' }}
        animate={{ rotate: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M90 52 Q106 38 106 31"
          stroke={primaryColor}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="106" cy="31" r="5.5" fill={primaryColor} />
        {/* Paint Brush */}
        <g transform="translate(106, 31) rotate(30)">
          {/* Handle */}
          <rect x="-1.5" y="-10" width="3" height="10" fill="#d4a373" rx="1" />
          {/* Metal ferrule */}
          <rect x="-2" y="-13" width="4" height="3" fill="#a1a1aa" />
          {/* Bristles */}
          <path d="M -2 -13 L 2 -13 L 2.5 -18 C 0 -20 -2.5 -20 -2.5 -18 Z" fill={primaryColor} />
          {/* Paint drip */}
          <circle cx="0" cy="-20" r="1.2" fill={primaryColor} />
        </g>
      </motion.g>

      {/* Body (egg) — gentle breathing, quicker and deeper when excited */}
      <motion.g
        style={{ transformOrigin: '60px 58px' }}
        animate={
          excited
            ? { scaleY: [1, 1.05, 1], scaleX: [1, 0.97, 1] }
            : { scaleY: [1, 1.02, 1], scaleX: [1, 0.99, 1] }
        }
        transition={{
          duration: excited ? 0.7 : 3.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <path
          d="M60 12 C40 12 26 34 26 57 C26 82 40 96 60 96 C80 96 94 82 94 57 C94 34 80 12 60 12 Z"
          fill={primaryColor}
        />
        <path
          d="M60 12 C40 12 26 34 26 57 C26 82 40 96 60 96 C80 96 94 82 94 57 C94 34 80 12 60 12 Z"
          fill="url(#bodyGloss)"
        />
      </motion.g>

      {/* Eyes — widen when excited */}
      <motion.g
        style={{ transformOrigin: '60px 44px' }}
        animate={{ scale: excited ? 1.12 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <ellipse cx="48" cy="44" rx="11" ry="13" fill="#ffffff" />
        <ellipse cx="72" cy="44" rx="11" ry="13" fill="#ffffff" />

        <motion.g
          animate={{ x: eyeOffset.x, y: eyeOffset.y }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <circle cx="48" cy="45" r="7.5" fill={scanColor} />
          <circle cx="48" cy="45" r="4" fill="#0d1b3e" />
          <circle cx="50" cy="42.5" r="1.8" fill="#ffffff" />
        </motion.g>
        <motion.g
          animate={{ x: eyeOffset.x, y: eyeOffset.y }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <circle cx="72" cy="45" r="7.5" fill={scanColor} />
          <circle cx="72" cy="45" r="4" fill="#0d1b3e" />
          <circle cx="74" cy="42.5" r="1.8" fill="#ffffff" />
        </motion.g>
      </motion.g>

      {/* Happy open mouth — grins wider when excited */}
      <motion.g
        style={{ transformOrigin: '60px 60px' }}
        animate={
          excited ? { scaleY: 1.5, scaleX: 1.12 } : { scaleY: [1, 1.18, 1], scaleX: 1 }
        }
        transition={
          excited
            ? { type: 'spring', stiffness: 300, damping: 18 }
            : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        <path d="M53 58 Q60 56.5 67 58 Q65.5 67 60 67.5 Q54.5 67 53 58 Z" fill="#7d1f3d" />
        <ellipse cx="60" cy="65" rx="3.4" ry="2.2" fill="#ff6f9c" />
      </motion.g>

      {/* Excitement sparkles */}
      {excited && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} fill="#ffd76a">
          {[
            { cx: 22, cy: 26, r: 2.6, delay: 0 },
            { cx: 99, cy: 74, r: 2.2, delay: 0.25 },
            { cx: 30, cy: 88, r: 2, delay: 0.5 },
          ].map((s) => (
            <motion.circle
              key={`${s.cx}-${s.cy}`}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              animate={{ scale: [0.6, 1.4, 0.6], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: s.delay,
              }}
            />
          ))}
        </motion.g>
      )}

      <defs>
        <radialGradient id="bodyGloss" cx="38%" cy="26%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#c21f6f" stopOpacity="0.25" />
        </radialGradient>
      </defs>
    </svg>
  );

  return (
    <div
      ref={containerRef}
      className={`relative ${className ?? ''}`}
      style={{ width: size, height: size, ...style }}
      onMouseEnter={interactive ? () => setIsHovered(true) : undefined}
      onMouseLeave={interactive ? () => setIsHovered(false) : undefined}
    >
      {/* Ai Sparkle Background Effect */}
      <AiSparkle 
        size="320%" 
        className="hidden md:block absolute top-[80%] left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 pointer-events-none opacity-80" 
      />

      {/* Excited hover tooltip (plain conditional: exit-coordination could leave
          a stale tooltip mounted, so it simply fades in and unmounts at once) */}
      {excited && !hideTooltips && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-2xl border-2 border-accent bg-white px-4 py-3 text-center text-[11px] font-black uppercase leading-relaxed tracking-[0.14em] text-accent shadow-2xl"
        >
          {hoverLabel}
          {/* little pointer — right/bottom borders continue the outline once rotated */}
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r-2 border-b-2 border-accent bg-white"
          />
        </motion.div>
      )}

      {isHovered && !hideTooltips && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-30">
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex w-max items-center justify-center gap-2 rounded-xl border border-accent bg-white/90 backdrop-blur-sm px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-accent shadow-lg"
          >
            CLICK TO CONNECT:
            <a
              href="https://www.instagram.com/mr.onehook"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-60 transition-opacity"
              onClick={(e) => e.stopPropagation()}
              aria-label="Instagram"
            >
              <Instagram className="w-4 h-4" />
            </a>
            <a
              href="https://www.youtube.com/@mr.onehook"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-60 transition-opacity flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
              aria-label="YouTube"
            >
              <Youtube className="w-5 h-5" />
            </a>
          </motion.div>
        </div>
      )}

      {interactive ? (
        <motion.button
          type="button"
          onClick={onClick}
          onPointerDown={() => {
            // Remember that the upcoming focus came from a pointer, not the keyboard.
            pointerFocusRef.current = true;
          }}
          onFocus={(e) => {
            // Only keyboard focus should excite the mascot. A mouse click also
            // focuses the button, which previously left it stuck in the excited
            // state after the pointer moved away.
            if (pointerFocusRef.current) {
              pointerFocusRef.current = false;
              return;
            }
            let keyboard = true;
            try {
              keyboard = e.currentTarget.matches(':focus-visible');
            } catch {
              keyboard = false;
            }
            if (keyboard) setIsFocused(true);
          }}
          onBlur={() => {
            pointerFocusRef.current = false;
            setIsFocused(false);
          }}
          aria-label={hoverLabel}
          className="block h-full w-full cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          animate={excited ? { y: [0, -9, 0] } : { y: 0 }}
          transition={
            excited
              ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
              : { type: 'spring', stiffness: 260, damping: 20 }
          }
          whileTap={{ scale: 0.94 }}
        >
          {mascotSvg}
        </motion.button>
      ) : (
        mascotSvg
      )}
    </div>
  );
};

export default AlienScanner;
