/**
 * OneHook Mascot
 *
 * A friendly pink egg mascot that sits next to content and waves for engagement.
 * - Statically placed (no floating / teleporting).
 * - Right hand waves on a gentle loop.
 * - Eyes softly track the cursor.
 * - Gentle breathing + subtly animated mouth for life.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

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
}

export const AlienScanner: React.FC<AlienScannerProps> = ({
  size,
  primaryColor = '#ff69b4',
  scanColor = '#0052CC',
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });

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
  const wave = {
    rotate: [0, -20, -4, -20, -4, 0],
  };
  const waveTransition = {
    duration: 1.8,
    repeat: Infinity,
    repeatDelay: 1.1,
    ease: 'easeInOut' as const,
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size, ...style }}
    >
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
          <path d="M31 64 Q20 70 12 74" strokeWidth="9" />
          <path d="M50 92 L49 108" strokeWidth="9" />
          <path d="M70 92 L71 108" strokeWidth="9" />
        </g>
        <g fill={primaryColor}>
          <circle cx="12" cy="74" r="5.5" />
          <ellipse cx="45" cy="109" rx="7" ry="4.5" />
          <ellipse cx="75" cy="109" rx="7" ry="4.5" />
        </g>

        {/* Waving right arm + hand (move together around the shoulder) */}
        <motion.g
          style={{ transformOrigin: '90px 52px' }}
          animate={wave}
          transition={waveTransition}
        >
          <path
            d="M90 52 Q101 42 106 31"
            stroke={primaryColor}
            strokeWidth="9"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="106" cy="31" r="5.5" fill={primaryColor} />
        </motion.g>

        {/* Body (egg) with gentle breathing */}
        <motion.g
          style={{ transformOrigin: '60px 58px' }}
          animate={{ scaleY: [1, 1.02, 1], scaleX: [1, 0.99, 1] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
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

        {/* Eyes */}
        <g>
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
        </g>

        {/* Happy open mouth */}
        <motion.g
          style={{ transformOrigin: '60px 60px' }}
          animate={{ scaleY: [1, 1.18, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path d="M53 58 Q60 56.5 67 58 Q65.5 67 60 67.5 Q54.5 67 53 58 Z" fill="#7d1f3d" />
          <ellipse cx="60" cy="65" rx="3.4" ry="2.2" fill="#ff6f9c" />
        </motion.g>

        <defs>
          <radialGradient id="bodyGloss" cx="38%" cy="26%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#c21f6f" stopOpacity="0.25" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
};

export default AlienScanner;
