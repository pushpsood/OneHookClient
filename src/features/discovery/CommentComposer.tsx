import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Send, Image as ImageIcon, Video, Volume2, MessageSquareQuote, Sparkles, Tag } from 'lucide-react';
import { LIKE_COMMENT_MAX_CHARS } from '../../api/rest';
import type { LikeTarget, LikeTargetType } from './like-target';

const TYPE_META: Record<LikeTargetType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  PHOTO: { label: 'Photo', icon: ImageIcon },
  VIDEO: { label: 'Video', icon: Video },
  VOICE: { label: 'Voice note', icon: Volume2 },
  PROMPT: { label: 'Prompt', icon: MessageSquareQuote },
  INTEREST: { label: 'Interest', icon: Tag },
  BIO: { label: 'Bio', icon: Sparkles },
};

export interface CommentComposerProps {
  key?: string;
  /** Who is being liked (display name only, for the header copy). */
  targetName: string;
  /** The specific element being commented on. */
  target: LikeTarget;
  /** Submit the like. Resolves on success; rejects (with the surfaced message) on failure. */
  onSubmit: (comment: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Hinge-style like composer. A like is ONLY sent from here: it shows what is being commented on,
 * enforces the backend's character cap client-side (with a live remaining count), and disables
 * submit while empty or in flight. On failure it shows the error and does not close, so the caller
 * never advances the deck for a rejected like.
 */
export function CommentComposer({ targetName, target, onSubmit, onCancel }: CommentComposerProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  const meta = TYPE_META[target.type];
  const Icon = meta.icon;
  const trimmedLength = comment.trim().length;
  const remaining = LIKE_COMMENT_MAX_CHARS - comment.length;
  const canSubmit = trimmedLength > 0 && comment.length <= LIKE_COMMENT_MAX_CHARS && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(comment.trim());
      // Parent closes the composer and advances on success.
    } catch (err: any) {
      setError(err?.message || 'We couldn’t send that just now. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 sm:p-8"
      onClick={() => {
        if (!submitting) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Comment on ${targetName}'s ${meta.label.toLowerCase()}`}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        className="w-full max-w-[460px] bg-white border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: what is being commented on */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" /> {meta.label}
            </span>
            <h3 className="text-lg font-serif italic tracking-tight text-foreground truncate">
              Comment on {targetName}
            </h3>
            {target.preview && (
              <p className="text-xs opacity-60 italic leading-relaxed line-clamp-3 border-l-2 border-accent/40 pl-3">
                “{target.preview}”
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel"
            className="shrink-0 w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-bg transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Composer */}
        <div className="p-5 space-y-3">
          <textarea
            ref={textareaRef}
            value={comment}
            maxLength={LIKE_COMMENT_MAX_CHARS}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment to send with your like…"
            rows={4}
            disabled={submitting}
            className="w-full resize-none border border-border bg-[#FAFAFA] p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
          />

          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-mono uppercase tracking-widest ${
                remaining < 0 ? 'text-red-600' : 'opacity-50'
              }`}
            >
              {remaining} left
            </span>
          </div>

          {error && (
            <p className="text-xs text-red-600 leading-relaxed" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 py-3.5 border border-border text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors disabled:opacity-40 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-3.5 bg-accent text-white text-[10px] font-bold uppercase tracking-[0.3em] hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow"
            >
              <Send className="w-3.5 h-3.5" /> {submitting ? 'Sending…' : 'Send Like'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
