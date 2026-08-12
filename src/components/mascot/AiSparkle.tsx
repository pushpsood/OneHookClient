import React, { useEffect, useRef, useState } from "react";
import { Sparkles, MessageCircle, ShieldCheck, Lock, LucideIcon } from "lucide-react";
import "./AiSparkle.css";

export interface SparkleBranch {
  label: string;
  icon: LucideIcon;
  angle: number; // angle from straight up (-180 to 180)
}

export interface AiSparkleProps {
  branches?: SparkleBranch[];
  size?: number | string; // controls the overall size of the component
  className?: string;
  triggerAnimation?: boolean; // force animation to run manually if desired
}

const DEFAULT_BRANCHES: SparkleBranch[] = [
  { label: "AI Inside", icon: Sparkles, angle: -100 },
  { label: "Understanding", icon: MessageCircle, angle: -62 },
  { label: "Privacy Intact", icon: ShieldCheck, angle: 62 },
  { label: "100% encrypted", icon: Lock, angle: 100 },
];

const RADIUS = 36; // % of the square canvas
const CTRL_RADIUS = 21;
const CTRL_SWEEP = 0.42;

function point(angle: number, dist: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: 50 + dist * Math.sin(rad), y: 50 - dist * Math.cos(rad) };
}

export const AiSparkle: React.FC<AiSparkleProps> = ({ 
  branches = DEFAULT_BRANCHES, 
  size = "100%", 
  className = "",
  triggerAnimation = false
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const isLive = triggerAnimation || inView;

  return (
    <div
      ref={wrapperRef}
      data-live={isLive ? "true" : "false"}
      className={`burst group aspect-square ${className.includes('absolute') || className.includes('fixed') ? className : `relative ${className}`}`}
      style={{ width: size, height: size, perspective: "1000px" }}
    >
      {/* Tiny observer element at the center to accurately track when the sparkle center comes into view */}
      <div ref={observerRef} className="absolute left-1/2 top-[30%] w-1 h-1 pointer-events-none" />

      <svg
        viewBox="0 0 100 100"
        className="pointer-events-none absolute inset-0 w-full h-full overflow-visible"
        aria-hidden="true"
        style={{ transformStyle: "preserve-3d" }}
      >
        <defs>
          <radialGradient id="streamGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--stream-from, #ff69b4)" stopOpacity="0" />
            <stop offset="25%" stopColor="var(--stream-from, #ff69b4)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--stream-to, #ff1493)" stopOpacity="1" />
          </radialGradient>
        </defs>
        {branches.map(({ angle, label }, i) => {
          const tip = point(angle, RADIUS);
          const ctrl = point(angle * CTRL_SWEEP, CTRL_RADIUS);
          return (
            <path
              key={label}
              className="burst-stream"
              d={`M 50 46 Q ${ctrl.x} ${ctrl.y} ${tip.x} ${tip.y}`}
              fill="none"
              stroke="url(#streamGradient)"
              strokeWidth={0.9}
              strokeLinecap="round"
              pathLength={1}
              style={{ animationDelay: `${i * 130}ms` }}
            />
          );
        })}
      </svg>

      {/* core glow */}
      <div className="burst-core absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="bg-[image:var(--gradient-core,radial-gradient(circle_at_32%_26%,#ff69b4,#ff1493_72%))] w-16 h-16 rounded-full blur-2xl sm:w-20 sm:h-20 opacity-50" />
      </div>

      {/* tips */}
      {branches.map(({ label, icon: Icon, angle }, i) => {
        const tip = point(angle, RADIUS);
        return (
          <div
            key={label}
            className="burst-tip absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center"
            style={{
              left: `${tip.x}%`,
              top: `${tip.y}%`,
              animationDelay: `${420 + i * 130}ms`,
            }}
          >
            <span className="flex w-12 h-12 items-center justify-center rounded-full bg-white shadow-md ring-2 ring-border">
              <Icon className="w-5 h-5 text-accent" strokeWidth={2} />
            </span>
            <p className="whitespace-nowrap text-[10px] font-bold tracking-tight text-accent sm:text-xs">
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default AiSparkle;
