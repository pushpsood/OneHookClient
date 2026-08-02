/**
 * OneHook Alien Scanner Mascot
 * 
 * A futuristic binocular-eyed alien that scans features for robustness and validity.
 * Eyes track mouse pointer and emit converging laser beams.
 * 
 * Features:
 * - Eyes follow mouse pointer
 * - Dual laser beams from eyes that converge
 * - Smooth vertical scanning animation
 * - Fully customizable colors and size
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';

interface AlienScannerProps {
  /** Enable scroll-based vertical movement */
  scrollBased?: boolean;
  /** Container element for scroll tracking (default: window) */
  scrollContainer?: React.RefObject<HTMLElement>;
  /** Animation speed in seconds (for auto mode) */
  speed?: number;
  /** Size in pixels */
  size?: number;
  /** Primary color (alien body) */
  primaryColor?: string;
  /** Secondary color (binocular lenses) */
  scanColor?: string;
  /** Enable scanning beam animation */
  showBeam?: boolean;
  /** Z-index for layering */
  zIndex?: number;
  /** Move vertically instead of horizontally */
  vertical?: boolean;
}

export const AlienScanner: React.FC<AlienScannerProps> = ({
  scrollBased = true,
  scrollContainer,
  speed = 20,
  size = 120,
  primaryColor = '#ff69b4',
  scanColor = '#0052CC',
  showBeam = true,
  zIndex = 10,
  vertical = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position3D, setPosition3D] = useState({ x: 20, y: 30, z: 0 }); // x%, y%, z (scale)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [laserAngle, setLaserAngle] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);

  // 3D movement - smooth floating in X, Y, and Z (depth via scale)
  useEffect(() => {
    const moveInterval = setInterval(() => {
      setPosition3D(prev => ({
        x: prev.x + (Math.random() - 0.5) * 2, // Move ±1% horizontally
        y: prev.y + (Math.random() - 0.5) * 2, // Move ±1% vertically
        z: prev.z + (Math.random() - 0.5) * 0.1, // Subtle depth change
      }));

      // Keep within bounds
      setPosition3D(prev => ({
        x: Math.max(5, Math.min(85, prev.x)),
        y: Math.max(10, Math.min(80, prev.y)),
        z: Math.max(-0.3, Math.min(0.3, prev.z)),
      }));
    }, 100);

    return () => clearInterval(moveInterval);
  }, []);

  // Random blinking with position teleport
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      // Random blink every 3-8 seconds
      const nextBlinkDelay = 3000 + Math.random() * 5000;
      
      setTimeout(() => {
        setIsBlinking(true);
        
        // During blink, teleport to new position
        setTimeout(() => {
          setPosition3D({
            x: 10 + Math.random() * 70, // Random X: 10-80%
            y: 15 + Math.random() * 65, // Random Y: 15-80%
            z: (Math.random() - 0.5) * 0.4, // Random depth: -0.2 to 0.2
          });
          
          setIsBlinking(false);
        }, 150); // Blink duration
      }, nextBlinkDelay);
    }, 100);

    return () => clearInterval(blinkInterval);
  }, []);

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Calculate eye direction and laser angle based on mouse position
  useEffect(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = mousePosition.x - centerX;
    const deltaY = mousePosition.y - centerY;
    
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxOffset = 3; // Maximum eye movement in pixels
    
    if (distance > 0) {
      const offsetX = (deltaX / distance) * Math.min(distance / 100, maxOffset);
      const offsetY = (deltaY / distance) * Math.min(distance / 100, maxOffset);
      setEyeOffset({ x: offsetX, y: offsetY });
      
      // Calculate angle for laser beam
      const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      setLaserAngle(angle);
    }
  }, [mousePosition, containerRef]);

  // Scroll-based animation (legacy, not used in 3D mode)
  const { scrollYProgress } = useScroll({
    target: scrollContainer,
  });

  const scrollPosition = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const smoothScrollPosition = useSpring(scrollPosition, { stiffness: 100, damping: 30 });

  // Calculate scale based on Z depth
  const depthScale = 1 + position3D.z;

  return (
    <motion.div
      ref={containerRef}
      className="alien-scanner-container"
      animate={{
        left: `${position3D.x}%`,
        top: `${position3D.y}%`,
        scale: depthScale,
        opacity: isBlinking ? 0 : 1,
      }}
      transition={{
        left: { type: 'spring', stiffness: 50, damping: 15 },
        top: { type: 'spring', stiffness: 50, damping: 15 },
        scale: { type: 'spring', stiffness: 80, damping: 20 },
        opacity: { duration: 0.15 },
      }}
      style={{
        position: 'absolute',
        zIndex,
        width: size,
        height: size,
        pointerEvents: 'none',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Dual laser beams from eyes that converge - can extend outside section */}
      {showBeam && !isBlinking && containerRef.current && (
        <div className="laser-beams" style={{ pointerEvents: 'none' }}>
          {/* Calculate laser beam length to cursor */}
          {(() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return null;
            
            const leftEyeX = rect.left + (45 / 120) * size * depthScale;
            const leftEyeY = rect.top + (50 / 120) * size * depthScale;
            const rightEyeX = rect.left + (75 / 120) * size * depthScale;
            const rightEyeY = rect.top + (50 / 120) * size * depthScale;
            
            const leftDistance = Math.sqrt(
              Math.pow(mousePosition.x - leftEyeX, 2) + 
              Math.pow(mousePosition.y - leftEyeY, 2)
            );
            const rightDistance = Math.sqrt(
              Math.pow(mousePosition.x - rightEyeX, 2) + 
              Math.pow(mousePosition.y - rightEyeY, 2)
            );
            
            return (
              <>
                {/* Left eye laser */}
                <motion.div
                  className="laser-left"
                  style={{
                    position: 'absolute',
                    left: `${(45 / 120) * size}px`,
                    top: `${(50 / 120) * size}px`,
                    width: `${Math.min(leftDistance, 3000)}px`,
                    height: '3px',
                    background: `linear-gradient(90deg, ${scanColor} 0%, ${scanColor}aa 50%, transparent 100%)`,
                    transformOrigin: 'left center',
                    transform: `rotate(${laserAngle}deg)`,
                    opacity: 0.8,
                    filter: 'blur(0.5px)',
                    pointerEvents: 'none',
                  }}
                  animate={{ opacity: [0.6, 0.9, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                
                {/* Right eye laser */}
                <motion.div
                  className="laser-right"
                  style={{
                    position: 'absolute',
                    left: `${(75 / 120) * size}px`,
                    top: `${(50 / 120) * size}px`,
                    width: `${Math.min(rightDistance, 3000)}px`,
                    height: '3px',
                    background: `linear-gradient(90deg, ${scanColor} 0%, ${scanColor}aa 50%, transparent 100%)`,
                    transformOrigin: 'left center',
                    transform: `rotate(${laserAngle}deg)`,
                    opacity: 0.8,
                    filter: 'blur(0.5px)',
                    pointerEvents: 'none',
                  }}
                  animate={{ opacity: [0.6, 0.9, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
                />
              </>
            );
          })()}

          {/* Converged beam glow at mouse position - fixed to viewport */}
          <motion.div
            className="laser-convergence"
            style={{
              position: 'fixed',
              left: mousePosition.x,
              top: mousePosition.y,
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${scanColor} 0%, ${scanColor}60 40%, transparent 100%)`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              opacity: 0.7,
              filter: 'blur(5px)',
            }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* Alien SVG */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Alien head (oval) */}
        <motion.ellipse
          cx="60"
          cy="55"
          rx="35"
          ry="42"
          fill={primaryColor}
          opacity={0.9}
          animate={{ ry: [42, 44, 42] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Head glow */}
        <ellipse cx="60" cy="55" rx="35" ry="42" fill="url(#headGlow)" opacity={0.4} />

        {/* Left binocular eye */}
        <g className="left-eye">
          <circle cx="45" cy="50" r="12" fill="#1a1a2e" opacity={0.8} />
          <motion.circle
            cx="45"
            cy="50"
            r="10"
            fill={scanColor}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Moving pupil */}
          <motion.circle
            cx={45 + eyeOffset.x}
            cy={50 + eyeOffset.y}
            r="3"
            fill="white"
            opacity={0.9}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          />
          
          {/* Scanning rings */}
          <motion.circle
            cx="45"
            cy="50"
            r="10"
            stroke={scanColor}
            strokeWidth="1"
            fill="none"
            animate={{ r: [10, 16, 10], opacity: [1, 0, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
        </g>

        {/* Right binocular eye */}
        <g className="right-eye">
          <circle cx="75" cy="50" r="12" fill="#1a1a2e" opacity={0.8} />
          <motion.circle
            cx="75"
            cy="50"
            r="10"
            fill={scanColor}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
          />
          {/* Moving pupil */}
          <motion.circle
            cx={75 + eyeOffset.x}
            cy={50 + eyeOffset.y}
            r="3"
            fill="white"
            opacity={0.9}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          />
          
          {/* Scanning rings */}
          <motion.circle
            cx="75"
            cy="50"
            r="10"
            stroke={scanColor}
            strokeWidth="1"
            fill="none"
            animate={{ r: [10, 16, 10], opacity: [1, 0, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.2 }}
          />
        </g>

        {/* Binocular bridge */}
        <rect x="53" y="48" width="14" height="4" rx="2" fill="#1a1a2e" opacity={0.6} />

        {/* Antennae */}
        <g className="antennae">
          <motion.line
            x1="40"
            y1="20"
            x2="35"
            y2="8"
            stroke={primaryColor}
            strokeWidth="2"
            strokeLinecap="round"
            animate={{ x2: [35, 33, 35], y2: [8, 5, 8] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.circle
            cx="35"
            cy="8"
            r="3"
            fill={scanColor}
            animate={{ r: [3, 4, 3], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.line
            x1="80"
            y1="20"
            x2="85"
            y2="8"
            stroke={primaryColor}
            strokeWidth="2"
            strokeLinecap="round"
            animate={{ x2: [85, 87, 85], y2: [8, 5, 8] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />
          <motion.circle
            cx="85"
            cy="8"
            r="3"
            fill={scanColor}
            animate={{ r: [3, 4, 3], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />
        </g>

        {/* Subtle mouth */}
        <motion.path
          d="M 50 70 Q 60 75 70 70"
          stroke={primaryColor}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity={0.5}
          animate={{ d: ['M 50 70 Q 60 75 70 70', 'M 50 70 Q 60 73 70 70', 'M 50 70 Q 60 75 70 70'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Body hint */}
        <motion.path
          d="M 35 85 Q 60 95 85 85"
          stroke={primaryColor}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity={0.6}
          animate={{ d: ['M 35 85 Q 60 95 85 85', 'M 35 85 Q 60 97 85 85', 'M 35 85 Q 60 95 85 85'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Gradients */}
        <defs>
          <radialGradient id="headGlow" cx="50%" cy="30%">
            <stop offset="0%" stopColor={scanColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={scanColor} stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </motion.div>
  );
};

export default AlienScanner;
