import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Send, Image as ImageIcon, Video, Volume2, MessageSquareQuote, Sparkles, Tag } from 'lucide-react';
import { LIKE_COMMENT_MAX_CHARS } from '../../api/rest';
import { SubscriptionTier } from '../../types';
import { useAppStore } from '../../store/app-store';
import type { LikeTarget, LikeTargetType } from './like-target';
import { trackLikeComposerOpen, trackLikeCommentAbandoned, UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

const MUST_MIN_WORDS = 10;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

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
  /** 'rose' shows the super-like framing (a daily-limited rose on the whole profile). */
  kind?: 'like' | 'rose';
  /** Optional tier override (defaults to signed-in user's SubscriptionTier). */
  tier?: SubscriptionTier;
  /** Optional handler to open the membership upgrade comparison sheet. */
  onOpenUpgrade?: () => void;
}

/**
 * Hinge-style like composer matching iOS `LikeComposerViewController.swift`:
 *  - On Must tier: requires at least 10 words + displays word counter and upgrade tease.
 *  - On Super / Infinity: comment is optional ("Send without a comment" available for regular likes;
 *    roses still carry a short note).
 */
export function CommentComposer({
  targetName,
  target,
  onSubmit,
  onCancel,
  kind = 'like',
  tier: tierProp,
  onOpenUpgrade,
}: CommentComposerProps) {
  const storeTier = useAppStore((s) => s.userState?.subscriptionTier);
  const tier = tierProp ?? storeTier;
  const isRose = kind === 'rose';
  const mustWordRule = tier === SubscriptionTier.MUST;
  const optionalPaidRule = tier != null && tier !== SubscriptionTier.MUST;
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Comment-to-like intent instrumentation: opening the composer signals intent; closing it WITHOUT
  // sending is the hesitation ("almost liked") signal. `submittedRef` is set optimistically in
  // handleSubmit so a successful send is never miscounted as an abandon, and reset on failure (the
  // composer stays open, so a later close is a genuine abandon). `commentRef` lets the unmount
  // cleanup read the latest draft length without re-subscribing.
  const openedAtRef = useRef(Date.now());
  const submittedRef = useRef(false);
  const commentRef = useRef('');
  useEffect(() => {
    commentRef.current = comment;
  }, [comment]);
  useEffect(() => {
    trackLikeComposerOpen(target.type, target.ref);
    return () => {
      if (!submittedRef.current) {
        trackLikeCommentAbandoned(
          target.type,
          Date.now() - openedAtRef.current,
          commentRef.current.trim().length > 0
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const words = countWords(comment);
  const remaining = LIKE_COMMENT_MAX_CHARS - comment.length;
  const meetsPolicy = mustWordRule
    ? words >= MUST_MIN_WORDS && comment.length <= LIKE_COMMENT_MAX_CHARS
    : optionalPaidRule
      ? comment.length <= LIKE_COMMENT_MAX_CHARS && (!isRose || trimmedLength > 0)
      : trimmedLength > 0 && comment.length <= LIKE_COMMENT_MAX_CHARS;
  const canSubmit = meetsPolicy && !submitting;

  const submitValue = async (value: string) => {
    setSubmitting(true);
    setError(null);
    // Committing a like — not an abandon. Reset if it fails (composer stays open on error).
    submittedRef.current = true;
    try {
      await onSubmit(value);
      // Parent closes the composer and advances on success.
    } catch (err: any) {
      submittedRef.current = false;
      setError(err?.message || 'We couldn’t send that just now. Please try again.');
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await submitValue(comment.trim());
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
      data-track-exempt="backdrop: click-away that cancels the like composer; the explicit cancel control (like_composer.cancel) is tracked."
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        className="w-full max-w-[460px] bg-white border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
      >
        {/* Header: what is being commented on */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" /> {meta.label}
            </span>
            <h3 className="text-lg font-serif italic tracking-tight text-foreground truncate">
              {isRose ? `Send a rose to ${targetName}` : `Comment on ${targetName}`}
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
            {...trackProps(UiElement.LIKE_COMPOSER_CANCEL)}
            className={`shrink-0 ${ICON_SECTION.modalHeader.button} disabled:opacity-40`}
          >
            <X className={ICON_SECTION.modalHeader.icon} />
          </button>
        </div>

        {/* Composer */}
        <div className="p-5 space-y-3">
          <textarea
            ref={textareaRef}
            value={comment}
            maxLength={LIKE_COMMENT_MAX_CHARS}
            onChange={(e) => setComment(e.target.value)}
            placeholder={isRose ? 'Add a note with your rose…' : 'Add a comment to send with your like…'}
            rows={4}
            disabled={submitting}
            className="w-full resize-none border border-border bg-[#FAFAFA] p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
          />

          <div className="flex items-center justify-between gap-2">
            {mustWordRule ? (
              <span
                className={`text-[10px] font-mono uppercase tracking-widest ${
                  words >= MUST_MIN_WORDS ? 'text-accent' : 'opacity-60'
                }`}
              >
                {words} / {MUST_MIN_WORDS} words
              </span>
            ) : (
              <span className="text-[11px] text-text-secondary">
                {optionalPaidRule
                  ? isRose
                    ? 'Add a short note with your rose.'
                    : 'A comment is optional — send with or without one.'
                  : ''}
              </span>
            )}
            <span
              className={`text-[10px] font-mono uppercase tracking-widest ${
                remaining < 0 ? 'text-red-600' : 'opacity-50'
              }`}
            >
              {remaining} left
            </span>
          </div>

          {mustWordRule && (
            <div className="p-3 rounded-xl bg-accent/5 border border-accent/20 text-xs space-y-1">
              <p className="text-text-secondary font-medium">
                On Super and Infinity you can comment only if you want to — no {MUST_MIN_WORDS}-word minimum.
              </p>
              {onOpenUpgrade && (
                <button
                  type="button"
                  onClick={onOpenUpgrade}
                  // TODO(telemetry-parity): switch to UiElement.LIKE_COMPOSER_UPGRADE once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for like_composer.upgrade"
                  className="text-accent font-bold hover:underline cursor-pointer"
                >
                  See what upgrading unlocks
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 leading-relaxed" role="alert">
              {error}
            </p>
          )}

          {optionalPaidRule && !isRose && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitValue('')}
              // TODO(telemetry-parity): switch to UiElement.LIKE_COMPOSER_SEND_WITHOUT_COMMENT once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for like_composer.send_without_comment"
              className="w-full py-2.5 border border-border text-[10px] font-bold uppercase tracking-[0.25em] hover:bg-bg transition-colors disabled:opacity-40 cursor-pointer"
            >
              Send without a comment
            </button>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              {...trackProps(UiElement.LIKE_COMPOSER_CANCEL)}
              className="flex-1 py-3.5 border border-border text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors disabled:opacity-40 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              {...trackProps(UiElement.LIKE_COMPOSER_SEND)}
              className="flex-1 py-3.5 bg-accent text-white text-[10px] font-bold uppercase tracking-[0.3em] hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow"
            >
              <Send className="w-3.5 h-3.5" /> {submitting ? 'Sending…' : isRose ? 'Send Rose 🌹' : 'Send Like'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
