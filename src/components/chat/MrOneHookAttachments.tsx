import { useRef } from 'react';
import { AlertTriangle, Check, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { MrOneHookPlan, type ChatAttachmentRef } from 'onehook-mr-onehook-client';
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
import { trackProps, UiElement } from '../../lib/analytics/analytics';

/**
 * The paperclip of the signed-in Mr OneHook chat. Opens the file picker; every member can select
 * files (Free members are offered Pro when they send). Never used by the public homepage chat.
 */
export function MrOneHookAttachButton({
  disabled,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: LocalFile[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        {...trackProps(UiElement.CHAT_ATTACH_BUTTON)}
        aria-label="Attach files for Mr OneHook"
        className="shrink-0 mr-2 w-8 h-8 rounded-full flex items-center justify-center text-text/60 hover:text-text hover:bg-surface-hover disabled:opacity-30 cursor-pointer"
      >
        <Paperclip className="w-4 h-4" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const picked: File[] = e.target.files ? Array.from(e.target.files) : [];
          const files: LocalFile[] = picked.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type,
            blob: f,
          }));
          e.target.value = '';
          if (files.length) onFiles(files);
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
              {...trackProps(UiElement.CHAT_ATTACH_BUTTON, {
                action: 'dismiss',
                targetId: 'remove',
              })}
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
              {...trackProps(UiElement.CHAT_FILE_OPEN)}
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
 * "Ask Mr OneHook" for files selected in a match chat. Pro: uploads them and opens the match's Mr
 * OneHook chat. Free: the selection stays, and the button reads "Get Mr OneHook Pro" (opens the Pro
 * screen).
 */
export function AskMrOneHookButton({
  plan,
  selectedCount,
  busy,
  onClick,
}: {
  plan: MrOneHookPlan;
  selectedCount: number;
  busy?: boolean;
  onClick: () => void;
}) {
  const free = plan !== MrOneHookPlan.PRO;
  return (
    <button
      type="button"
      disabled={!free && (Boolean(busy) || selectedCount === 0)}
      onClick={onClick}
      data-action={free ? 'get_pro' : 'ask'}
      {...(free
        ? trackProps(UiElement.CHAT_MR_ONEHOOK_UPGRADE_OPEN, { targetId: 'ask_mr_onehook' })
        : trackProps(UiElement.CHAT_MR_ONEHOOK_CONTEXT_SHARE))}
      className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
    >
      {free ? 'Get Mr OneHook Pro' : busy ? 'Preparing…' : 'Ask Mr OneHook'}
    </button>
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
