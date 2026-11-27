/**
 * Reusable Chat overlay dialogs matching iOS:
 *  - EmojiReactionPickerDialog (categorized + keyword-searchable reaction picker)
 *  - ReactionDetailsDialog (who reacted with what, tap own reaction to remove)
 *  - MessageInfoDialog (sent / delivered / read timestamps, disappearing duration, E2EE status)
 *  - ChatIntroStoriesDialog (interactive story walkthrough with pause/reduce-motion support)
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Lock, Pause, Play, Search, ShieldCheck, Sparkles, Star, X } from 'lucide-react';
import { ModalDialog } from '../common/ModalDialog';
import {
  EMOJI_CATEGORIES,
  listReactors,
  parseReactionEmojis,
  sameReactionEmoji,
} from '../../lib/chat-reactions';
import { formatDisappearingLong, getSentDisappearingSeconds } from '../../lib/chat-timeline';
import type { ChatMessageView } from '../../types';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

// ── Full Emoji Reaction Picker ────────────────────────────────────────────────

export function EmojiReactionPickerDialog({
  open,
  onClose,
  currentReactionSet,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  currentReactionSet?: string | null;
  onPick: (emoji: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const currentList = useMemo(() => parseReactionEmojis(currentReactionSet), [currentReactionSet]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return EMOJI_CATEGORIES.find((c) => c.id === activeCategory)?.emojis ?? EMOJI_CATEGORIES[0].emojis;
    }
    return EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter(
      (item) => item.emoji.includes(q) || item.keywords.includes(q)
    );
  }, [query, activeCategory]);

  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="emoji-picker-title" className="max-w-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <h1 id="emoji-picker-title" className="text-sm font-bold text-text">
          Choose reaction
        </h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reaction picker"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <search>
          <label htmlFor="reaction-search" className="sr-only">
            Search emoji
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id="reaction-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emoji…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-surface border border-border text-text outline-none focus:border-accent"
            />
          </div>
        </search>

        {!query.trim() && (
          <div role="tablist" aria-label="Emoji categories" className="flex gap-1.5 overflow-x-auto pb-1">
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
                // TODO(telemetry-parity): switch to UiElement.CHAT_REACTION_PICKER_CATEGORY once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.reaction_picker_category"
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-accent text-bg border-accent'
                    : 'bg-surface border-border text-text-secondary'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-6 gap-1.5 max-h-56 overflow-y-auto py-1">
          {filtered.map((item) => {
            const active = currentList.some((c) => sameReactionEmoji(c, item.emoji));
            return (
              <button
                key={item.emoji}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onPick(item.emoji);
                  onClose();
                }}
                // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_REACT once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_react"
                className={`h-10 rounded-xl text-xl flex items-center justify-center transition-colors cursor-pointer ${
                  active ? 'bg-accent/15 ring-1 ring-accent' : 'hover:bg-surface-hover'
                }`}
              >
                {item.emoji}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-6 text-center text-xs text-text-muted py-6">No matching emoji</p>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}

// ── Reactions Details Dialog ──────────────────────────────────────────────────

export function ReactionDetailsDialog({
  open,
  onClose,
  reactions,
  myUserId,
  partnerName,
  initialEmoji,
  onToggleMine,
}: {
  open: boolean;
  onClose: () => void;
  reactions: Record<string, string>;
  myUserId?: string;
  partnerName: string;
  initialEmoji?: string;
  onToggleMine: (emoji: string) => void;
}) {
  const entries = useMemo(() => listReactors(reactions, myUserId), [reactions, myUserId]);
  const [tab, setTab] = useState<string>(initialEmoji || 'ALL');

  useEffect(() => {
    if (open) setTab(initialEmoji || 'ALL');
  }, [open, initialEmoji]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      map.set(e.emoji, (map.get(e.emoji) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [entries]);

  const shown = useMemo(
    () => (tab === 'ALL' ? entries : entries.filter((e) => sameReactionEmoji(e.emoji, tab))),
    [entries, tab]
  );

  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="reaction-details-title" className="max-w-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <h1 id="reaction-details-title" className="text-sm font-bold text-text">
          Reactions
        </h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reactions"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div role="tablist" aria-label="Reaction filter" className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ALL'}
            onClick={() => setTab('ALL')}
            // TODO(telemetry-parity): switch to UiElement.CHAT_REACTION_DETAILS_TAB once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for chat.reaction_details_tab"
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer ${
              tab === 'ALL' ? 'bg-accent text-bg border-accent' : 'bg-surface border-border text-text-secondary'
            }`}
          >
            All {entries.length}
          </button>
          {counts.map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              role="tab"
              aria-selected={sameReactionEmoji(tab, emoji)}
              onClick={() => setTab(emoji)}
              // TODO(telemetry-parity): switch to UiElement.CHAT_REACTION_DETAILS_TAB once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.reaction_details_tab"
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer ${
                sameReactionEmoji(tab, emoji)
                  ? 'bg-accent text-bg border-accent'
                  : 'bg-surface border-border text-text-secondary'
              }`}
            >
              {emoji} {count}
            </button>
          ))}
        </div>

        <ul className="divide-y divide-border/60 max-h-60 overflow-y-auto">
          {shown.map((entry) => (
            <li key={`${entry.userId}-${entry.emoji}`} className="py-2.5 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">
                  {entry.isMine ? 'You' : partnerName}
                </p>
                {entry.isMine && (
                  <p className="text-[11px] text-text-muted">Tap remove to take back your reaction</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xl">{entry.emoji}</span>
                {entry.isMine && (
                  <button
                    type="button"
                    onClick={() => onToggleMine(entry.emoji)}
                    // TODO(telemetry-parity): switch to UiElement.CHAT_REACTION_REMOVE once enabled on web.
                    data-track-exempt="disabled: pending telemetry web parity enablement for chat.reaction_remove"
                    className="px-2 py-1 rounded-lg border border-border text-[11px] font-semibold text-text-secondary hover:text-red-500 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="py-6 text-center text-xs text-text-muted">No reactions yet.</li>
          )}
        </ul>
      </div>
    </ModalDialog>
  );
}

// ── Message Info Dialog ───────────────────────────────────────────────────────

export function MessageInfoDialog({
  message,
  onClose,
  starred,
}: {
  message: ChatMessageView | null;
  onClose: () => void;
  starred?: boolean;
}) {
  if (!message) return null;
  const expiring = getSentDisappearingSeconds(message.messageId);
  const fmt = (ms?: number | null) => (ms ? new Date(ms).toLocaleString() : '—');

  return (
    <ModalDialog open={Boolean(message)} onClose={onClose} labelledBy="message-info-title" className="max-w-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <h1 id="message-info-title" className="text-sm font-bold text-text">
          Message info
        </h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close message info"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>
      <div className="p-4 space-y-3 text-xs">
        <div className="space-y-2 rounded-xl bg-surface border border-border p-3">
          <div className="flex justify-between gap-3">
            <span className="text-text-secondary">Sent</span>
            <span className="font-medium text-text">{fmt(message.timestamp)}</span>
          </div>
          {message.senderId === 'me' && (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-text-secondary">Delivered</span>
                <span className="font-medium text-text">{fmt(message.deliveredAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-secondary">Read</span>
                <span className="font-medium text-text">{fmt(message.readAt)}</span>
              </div>
            </>
          )}
          {expiring && (
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Disappears after
              </span>
              <span className="font-medium text-text">{formatDisappearingLong(expiring)}</span>
            </div>
          )}
          {starred && (
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary flex items-center gap-1">
                <Star className="w-3.5 h-3.5" aria-hidden="true" /> Starred
              </span>
              <span className="font-medium text-accent flex items-center gap-1">
                <Check className="w-3 h-3" /> Private to you
              </span>
            </div>
          )}
        </div>
        <div className="flex items-start gap-2 text-text-secondary leading-relaxed">
          <Lock className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" aria-hidden="true" />
          <span>End-to-end encrypted with Wire v2. Only your and your match&rsquo;s verified devices can read this message.</span>
        </div>
      </div>
    </ModalDialog>
  );
}

// ── Chat Intro Stories Modal ──────────────────────────────────────────────────

interface ChatStoryCard {
  eyebrow: string;
  title: string;
  body: string;
}

const CHAT_INTRO_STORIES: readonly ChatStoryCard[] = [
  {
    eyebrow: 'ONE CONNECTION',
    title: 'Real conversations, unhurried',
    body: 'On OneHook you hold one active hook at a time on Must and Super, so every conversation has space to breathe.',
  },
  {
    eyebrow: 'PRIVACY BY DESIGN',
    title: 'End-to-end encrypted messages & calls',
    body: 'Text, photos, voice notes, locations and calls are encrypted on your devices. Passkeys let new devices unlock older messages safely.',
  },
  {
    eyebrow: 'AI COMPANION',
    title: 'Mr.OneHook is right beside your chats',
    body: 'Ask for conversation starters, date ideas, or select specific messages to reflect on together — nothing is ever shared unless you confirm.',
  },
  {
    eyebrow: 'STAY IN CONTROL',
    title: 'Archive when letting go, restrict saves & exports',
    body: 'Pause an ending chat as a read-only archive to revisit later, or restrict saving media and sharing with Mr.OneHook in Chat settings.',
  },
];

export function ChatIntroStoriesDialog({
  open,
  onClose,
  onExploreDiscover,
  onAddByUsername,
}: {
  open: boolean;
  onClose: () => void;
  onExploreDiscover: () => void;
  onAddByUsername: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setPaused(false);
    }
  }, [open]);

  // Respect prefers-reduced-motion: do not auto-advance when user prefers reduced motion.
  useEffect(() => {
    if (!open || paused) return;
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1 < CHAT_INTRO_STORIES.length ? i + 1 : i));
    }, 6000);
    return () => window.clearInterval(timer);
  }, [open, paused]);

  const card = CHAT_INTRO_STORIES[index];

  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="chat-intro-title" className="max-w-md">
      <div className="p-5 space-y-5 bg-surface-card text-text">
        <div className="flex items-center gap-1.5" aria-label="Story progress">
          {CHAT_INTRO_STORIES.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= index ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.25em] font-black text-accent flex items-center gap-1.5">
            <Sparkles className={ICON_SECTION.section.headingIcon} aria-hidden="true" /> {card.eyebrow}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Play walkthrough' : 'Pause walkthrough'}
              data-track-exempt="continuous: story playback pause toggle per WCAG 2.2.2"
              className={ICON_SECTION.modalHeader.button}
            >
              {paused ? (
                <Play className={ICON_SECTION.modalHeader.icon} />
              ) : (
                <Pause className={ICON_SECTION.modalHeader.icon} />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close walkthrough"
              // TODO(telemetry-parity): switch to UiElement.CHAT_INTRO_DISMISS once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.intro_dismiss"
              className={ICON_SECTION.modalHeader.button}
            >
              <X className={ICON_SECTION.modalHeader.icon} />
            </button>
          </div>
        </div>

        <div className="min-h-[8rem] space-y-2.5">
          <h1 id="chat-intro-title" className="text-xl font-bold text-text leading-snug">
            {card.title}
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">{card.body}</p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            data-track-exempt="duplicate: walkthrough pagination control"
            className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-text disabled:opacity-30 cursor-pointer"
          >
            Previous
          </button>
          {index < CHAT_INTRO_STORIES.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(CHAT_INTRO_STORIES.length - 1, i + 1))}
              data-track-exempt="duplicate: walkthrough pagination control"
              className="px-4 py-2 rounded-xl bg-accent text-bg text-xs font-semibold cursor-pointer"
            >
              Next
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddByUsername();
                }}
                {...trackProps(UiElement.CHAT_ADD_HOOK_OPEN)}
                className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-text cursor-pointer"
              >
                Add username
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExploreDiscover();
                }}
                // TODO(telemetry-parity): switch to UiElement.CHAT_INTRO_GET_STARTED once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.intro_get_started"
                className="px-4 py-2 rounded-xl bg-accent text-bg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Get started
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
