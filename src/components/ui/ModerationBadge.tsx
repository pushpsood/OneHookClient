import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, Bot } from 'lucide-react';

export interface ModerationBadgeProps {
  status?: 'APPROVED' | 'PENDING' | 'REJECTED' | 'AI_GENERATED_IMAGE' | string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const ModerationBadge: React.FC<ModerationBadgeProps> = ({
  status,
  className = '',
  size = 'sm',
  showLabel = false,
}) => {
  if (!status) return null;

  const normalized = status.toUpperCase();

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  if (normalized === 'APPROVED') {
    return (
      <span
        className={`inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm shadow-sm transition-all duration-200 hover:border-emerald-500/60 ${className}`}
        title="Approved: Screened & safe"
      >
        <CheckCircle2 className={`${iconSizes[size]} text-emerald-400 shrink-0`} />
        {showLabel && <span>Approved</span>}
      </span>
    );
  }

  if (normalized === 'PENDING' || normalized.includes('PENDING')) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-amber-300 bg-amber-950/60 border border-amber-500/30 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm shadow-sm animate-pulse transition-all duration-200 hover:border-amber-500/60 ${className}`}
        title="Pending: Screening for toxicity and safety"
      >
        <Clock className={`${iconSizes[size]} text-amber-300 shrink-0`} />
        {showLabel && <span>Under Review</span>}
      </span>
    );
  }

  // AI-generated image: distinct violet/purple badge with Bot icon so users
  // clearly understand why it was rejected (not a content violation, but an
  // AI-image policy violation).
  if (normalized === 'AI_GENERATED_IMAGE') {
    return (
      <span
        className={`inline-flex items-center gap-1 text-violet-300 bg-violet-950/60 border border-violet-500/30 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm shadow-sm transition-all duration-200 hover:border-violet-500/60 ${className}`}
        title="Rejected: AI-generated images are not allowed — please upload a real photo"
      >
        <Bot className={`${iconSizes[size]} text-violet-300 shrink-0`} />
        {showLabel && <span>AI Image</span>}
      </span>
    );
  }

  if (normalized === 'REJECTED') {
    return (
      <span
        className={`inline-flex items-center gap-1 text-rose-400 bg-rose-950/60 border border-rose-500/30 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm shadow-sm transition-all duration-200 hover:border-rose-500/60 ${className}`}
        title="Rejected: Content violates community guidelines"
      >
        <AlertTriangle className={`${iconSizes[size]} text-rose-400 shrink-0`} />
        {showLabel && <span>Flagged</span>}
      </span>
    );
  }

  return null;
};
