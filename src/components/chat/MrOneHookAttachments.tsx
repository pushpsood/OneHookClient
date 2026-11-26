import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, FileText, Loader2, Paperclip, Sparkles, X } from 'lucide-react';
import { MrOneHookPlan, type ChatAttachmentRef, type ExcerptSpeaker } from 'onehook-mr-onehook-client';
import {
  attachmentFailureCopy,
  attachmentProblemCopy,
  attachmentRefLabel,
} from '../../lib/mr-onehook-contract';
import type {
  ComposerAction,
  LocalFile,
  PendingAttachment,
} from '../../lib/mr-onehook-attachments';
import { isHeicFile, prepareAttachmentFiles } from '../../lib/heic-to-jpeg';
import { askConfirmTitle, askCountPhrase, type AskShare } from '../../lib/mr-onehook-ask';
import type { SelectedExcerpt } from '../../lib/mr-onehook-excerpts';
import { trackProps, trackUi, UiElement } from '../../lib/analytics/analytics';

/**
 * The paperclip of the signed-in Mr OneHook chat. Opens the file picker; every member can select
 * files (Free members are offered Pro when they send). Never used by the public homepage chat.
 *
 * HEIC/HEIF photos are converted to JPEG here, before `onFiles` (see lib/heic-to-jpeg.ts); the
 * converter loads on demand, and while it runs the paperclip shows a spinner.
 */
export function MrOneHookAttachButton({
  disabled,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: LocalFile[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [converting, setConverting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The picker was closed without choosing (the `cancel` event of a file input).
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onCancel = () => trackUi(UiElement.CHAT_MR_ONEHOOK_ATTACH_OPEN, { action: 'dismiss' });
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  const handlePicked = async (picked: File[]) => {
    let files: LocalFile[] = picked.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      blob: f,
    }));
    if (files.length === 0) return;
    if (files.some(isHeicFile)) {
      setConverting(true);
      try {
        files = await prepareAttachmentFiles(files);
      } finally {
        if (mounted.current) setConverting(false);
      }
    }
    if (mounted.current) onFiles(files);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || converting}
        onClick={() => input.current?.click()}
        {...trackProps(UiElement.CHAT_MR_ONEHOOK_ATTACH_OPEN)}
        aria-label={converting ? 'Preparing photos' : 'Attach files for Mr OneHook'}
        aria-busy={converting || undefined}
        className="shrink-0 mr-2 w-8 h-8 rounded-full flex items-center justify-center text-text/60 hover:text-text hover:bg-surface-hover disabled:opacity-30 cursor-pointer"
      >
        {converting ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Paperclip className="w-4 h-4" />
        )}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        data-testid="mr-onehook-file-input"
        onChange={(e) => {
          const picked: File[] = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          void handlePicked(picked);
        }}
      />
    </>
  );
}

function chipStatus(item: PendingAttachment): {
  label: string;
  icon: 'spin' | 'ok' | 'warn' | 'none';
} {
  switch (item.status) {
    case 'uploading':
      return { label: 'Uploading…', icon: 'spin' };
    case 'processing':
      return { label: 'Reading…', icon: 'spin' };
    case 'ready':
      return { label: 'Ready', icon: 'ok' };
    case 'failed':
      return {
        label: item.problem
          ? attachmentProblemCopy(item.problem)
          : attachmentFailureCopy(item.failureReason),
        icon: 'warn',
      };
    default:
      return { label: item.origin ? 'From your chat' : 'Selected', icon: 'none' };
  }
}

/** The files waiting to be sent, one chip each with its status. */
export function PendingAttachmentChips({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2 pb-2" data-testid="mr-onehook-attachment-chips">
      {items.map((item) => {
        const s = chipStatus(item);
        return (
          <li
            key={item.localId}
            data-status={item.status}
            className={`flex items-center gap-1.5 max-w-full rounded-full border px-2.5 py-1 text-[11px] ${
              item.status === 'failed'
                ? 'border-orange-500/40 bg-orange-500/10'
                : 'border-border bg-surface'
            }`}
          >
            {s.icon === 'spin' && (
              <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />
            )}
            {s.icon === 'ok' && (
              <Check className="w-3 h-3 text-green-600 shrink-0" aria-hidden="true" />
            )}
            {s.icon === 'warn' && (
              <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" aria-hidden="true" />
            )}
            {s.icon === 'none' && (
              <FileText className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
            )}
            <span className="truncate max-w-[10rem] font-semibold text-text">{item.name}</span>
            <span className="truncate text-text-secondary">{s.label}</span>
            <button
              type="button"
              onClick={() => onRemove(item.localId)}
              {...trackProps(UiElement.CHAT_MR_ONEHOOK_ATTACHMENT_REMOVE)}
              aria-label={`Remove ${item.name}`}
              className="w-4 h-4 rounded-full flex items-center justify-center text-text/50 hover:text-text cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Files of a sent or saved turn. Uploaded ones open (GetChatAttachmentContent); files from a match chat
 * were never kept, so they are labelled "From your chat" and do not open.
 */
export function SentAttachmentChips({
  refs,
  onOpen,
  inverted,
}: {
  refs: ChatAttachmentRef[];
  onOpen: (ref: ChatAttachmentRef) => void;
  inverted?: boolean;
}) {
  if (refs.length === 0) return null;
  const chip = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] max-w-full ${
    inverted ? 'bg-white/15 text-white' : 'bg-surface border border-border text-text'
  }`;
  return (
    <ul className="flex flex-wrap gap-1.5 mt-2" data-testid="mr-onehook-sent-attachments">
      {refs.map((ref, i) => (
        <li key={`${ref.attachmentId ?? ref.name}-${i}`}>
          {ref.attachmentId ? (
            <button
              type="button"
              onClick={() => onOpen(ref)}
              {...trackProps(UiElement.CHAT_MR_ONEHOOK_ATTACHMENT_OPEN)}
              className={`${chip} cursor-pointer hover:opacity-80`}
            >
              <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[12rem]">{attachmentRefLabel(ref)}</span>
            </button>
          ) : (
            <span className={chip}>
              <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[12rem]">{attachmentRefLabel(ref)}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Ask Mr OneHook" for the messages and files selected in a match chat. It opens the confirmation
 * (nothing is sent before the member confirms). Files need Mr OneHook Pro: on the Free plan, with files
 * among the selection, the selection stays and the button reads "Get Mr OneHook Pro" (opens the Pro
 * screen). Messages alone work on every plan.
 */
export function AskMrOneHookButton({
  plan,
  selectedCount,
  fileCount,
  busy,
  onClick,
}: {
  plan: MrOneHookPlan;
  selectedCount: number;
  /** How many of the selected are photos or files. */
  fileCount: number;
  busy?: boolean;
  onClick: () => void;
}) {
  const getPro = plan !== MrOneHookPlan.PRO && fileCount > 0;
  return (
    <button
      type="button"
      disabled={!getPro && (Boolean(busy) || selectedCount === 0)}
      onClick={onClick}
      data-action={getPro ? 'get_pro' : 'ask'}
      {...(getPro
        ? trackProps(UiElement.CHAT_MR_ONEHOOK_GET_PRO, { value: 'ask_from_chat' })
        : trackProps(UiElement.CHAT_SELECT_ASK_MR_ONEHOOK))}
      className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
    >
      {getPro ? 'Get Mr OneHook Pro' : busy ? 'Preparing…' : 'Ask Mr OneHook'}
    </button>
  );
}

/**
 * The confirmation before anything leaves the device: every selected message exactly as it will be
 * sent (who, when, the text) and every file (who, when, the name). "Share & ask" opens this match's
 * Mr OneHook chat with them attached to the next question; "Don't share" sends nothing and ends the
 * selection.
 */
export function AskMrOneHookConfirm({
  share,
  matchName,
  onConfirm,
  onCancel,
  maxMessageCharacters,
}: {
  share: AskShare;
  matchName: string;
  onConfirm: () => void;
  onCancel: () => void;
  maxMessageCharacters: number;
}) {
  const who = (speaker: ExcerptSpeaker) => (speaker === 'self' ? 'You' : matchName);
  const total = share.excerpts.length + share.files.length;
  const what =
    total === 1
      ? share.excerpts.length === 1
        ? 'this message'
        : 'this file'
      : `these ${askCountPhrase(share.excerpts.length, share.files.length)}`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-mr-onehook-confirm-title"
      data-testid="ask-mr-onehook-confirm"
    >
      <div className="w-full max-w-md rounded-2xl border border-accent/40 bg-surface-card p-5 space-y-3 shadow-xl">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
          <h2 id="ask-mr-onehook-confirm-title" className="text-sm font-semibold text-text">
            {askConfirmTitle(share)}
          </h2>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed">
          Mr OneHook will see only {what} from your chat with {matchName}, with the question you ask
          next. {share.files.length > 0
            ? 'Files are decrypted on this device, read for that question only and then deleted.'
            : 'They are sent only for that question and are never stored by OneHook.'}
        </p>
        {share.shortened.length > 0 && (
          <p className="text-[11px] text-text-muted leading-relaxed">
            Long messages are shortened to {maxMessageCharacters.toLocaleString('en-US')} characters (marked …).
          </p>
        )}
        <ul className="space-y-2 max-h-72 overflow-y-auto" data-testid="ask-mr-onehook-confirm-items">
          {share.excerpts.map((excerpt, i) => (
            <li key={`m-${excerpt.sentAt}-${i}`} className="rounded-xl bg-surface border border-border/60 p-3 text-xs">
              <div className="flex items-center justify-between mb-1 text-[9px] uppercase tracking-widest opacity-50">
                <span>{who(excerpt.speaker)}</span>
                <span>{new Date(excerpt.sentAt).toLocaleString()}</span>
              </div>
              <p className="text-text leading-relaxed break-words whitespace-pre-wrap">
                {excerpt.text}
                {share.shortened.includes(i) ? '…' : ''}
              </p>
            </li>
          ))}
          {share.files.map((file) => (
            <li key={`f-${file.messageId}`} className="rounded-xl bg-surface border border-border/60 p-3 text-xs">
              <div className="flex items-center justify-between mb-1 text-[9px] uppercase tracking-widest opacity-50">
                <span>{who(file.sender)}</span>
                <span>{new Date(file.timestamp).toLocaleString()}</span>
              </div>
              <p className="flex items-center gap-1.5 text-text">
                <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" aria-hidden="true" />
                <span className="truncate">{file.envelope.name || `${file.envelope.kind}`}</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            {...trackProps(UiElement.CHAT_SELECT_CANCEL)}
            className="flex-1 py-2 border border-border text-xs font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text cursor-pointer"
          >
            Don&rsquo;t share
          </button>
          <button
            type="button"
            onClick={onConfirm}
            {...trackProps(UiElement.CHAT_MR_ONEHOOK_CONTEXT_SHARE)}
            className="flex-1 py-2 bg-accent text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
          >
            Share &amp; ask
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Above the Mr OneHook composer while the question about the confirmed messages is being written: what
 * goes with it, and a way to take the messages back out (nothing has been sent yet).
 */
export function AskingAboutBar({
  excerpts,
  matchName,
  onRemove,
}: {
  excerpts: SelectedExcerpt[];
  matchName?: string;
  onRemove: () => void;
}) {
  if (excerpts.length === 0) return null;
  const title =
    excerpts.length === 1
      ? excerpts[0].speaker === 'self'
        ? 'Asking about your message'
        : `Asking about ${matchName ?? 'your match'}’s message`
      : `Asking about ${excerpts.length} messages`;
  return (
    <div
      className="flex items-start gap-2 mb-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-xs"
      data-testid="mr-onehook-asking-about"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text">{title}</p>
        <p className="truncate text-text-secondary">{excerpts.map((e) => e.text).join(' · ')}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        {...trackProps(UiElement.CHAT_MR_ONEHOOK_CONTEXT_SHARE, { action: 'dismiss' })}
        aria-label={excerpts.length === 1 ? 'Remove the shared message' : 'Remove the shared messages'}
        className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-text/50 hover:text-text cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** The Mr OneHook composer's send button label for a {@link composerAction}. */
export function composerSendLabel(action: ComposerAction): string | undefined {
  switch (action) {
    case 'GET_PRO':
      return 'Get Mr OneHook Pro';
    case 'WAIT':
      return 'Reading files…';
    case 'FIX':
      return 'Remove failed files';
    default:
      return undefined;
  }
}
