/**
 * Files for a Mr OneHook chat turn (Mr OneHook Pro). The flow per file:
 *
 *   selected ──upload──▶ uploading ──202──▶ processing ──poll every 1.5 s──▶ ready | failed
 *
 * then the turn is sent with the READY ids in `attachmentIds`. A file from a match chat (decrypted on
 * this device) is uploaded with its `matchId` and `sender`, and may arrive here already uploaded
 * (`attachmentId` set, `processing`), in which case only the polling runs.
 *
 * Free members can select files (client-side checks still apply), but the send button reads "Get Mr
 * OneHook Pro" and opens the Pro screen ({@link composerAction}); nothing is uploaded.
 *
 * Everything here is framework-free and takes its network calls as {@link AttachmentDeps}, so the
 * state machine is unit-tested without a network. The signed-in chat wires the generated SDK in.
 * The public homepage chat never uses this module: it never takes files.
 */
import {
  AttachmentStatus,
  MrOneHookPlan,
  type AttachmentKind,
  type ChatAttachment,
  type ExcerptSpeaker,
  type MrOneHookPlanLimits,
} from 'onehook-mr-onehook-client';
import { classifyAttachmentError, type AttachmentProblem } from './mr-onehook-contract';

/** Polling interval: `GetChatAttachment` has its own budget of 60 calls a minute per member. */
export const ATTACHMENT_POLL_INTERVAL_MS = 1500;
/** After a 429 on a poll, wait this long before the next one. */
export const ATTACHMENT_POLL_BACKOFF_MS = 5000;
/** Give up polling after this long (processing normally takes seconds; a video can take a minute). */
export const ATTACHMENT_POLL_TIMEOUT_MS = 3 * 60 * 1000;

export type PendingAttachmentStatus = 'selected' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface AttachmentOrigin {
  matchId: string;
  sender: ExcerptSpeaker;
}

export interface PendingAttachment {
  /** Client id for the chip (stable across status changes). */
  localId: string;
  name: string;
  sizeBytes: number;
  /** What the browser believes the file is; the server reads the type from the bytes. */
  contentType: string;
  /** The bytes; absent once uploaded elsewhere (a match-chat file handed over with its id). */
  blob?: Blob;
  origin?: AttachmentOrigin;
  status: PendingAttachmentStatus;
  attachmentId?: string;
  /** From the server once uploaded. */
  kind?: AttachmentKind;
  problem?: AttachmentProblem;
  /** `FAILED` only. */
  failureReason?: string;
}

export interface LocalFile {
  name: string;
  size: number;
  type: string;
  blob: Blob;
}

export type SelectionRejection = { name: string; reason: 'TOO_LARGE' | 'TOO_MANY' };

let localCounter = 0;
function nextLocalId(): string {
  localCounter += 1;
  return `att-${Date.now().toString(36)}-${localCounter}`;
}

/**
 * Adds picked files to the current selection: at most `maxAttachmentsPerMessage` in total, each at most
 * `maxAttachmentBytes` (rejected here, before any upload).
 */
export function selectAttachments(
  current: readonly PendingAttachment[],
  files: readonly LocalFile[],
  limits: Pick<MrOneHookPlanLimits, 'maxAttachmentBytes' | 'maxAttachmentsPerMessage'>,
  origin?: AttachmentOrigin
): { items: PendingAttachment[]; rejected: SelectionRejection[] } {
  const items = [...current];
  const rejected: SelectionRejection[] = [];
  for (const file of files) {
    if (file.size > limits.maxAttachmentBytes) {
      rejected.push({ name: file.name, reason: 'TOO_LARGE' });
      continue;
    }
    if (items.length >= limits.maxAttachmentsPerMessage) {
      rejected.push({ name: file.name, reason: 'TOO_MANY' });
      continue;
    }
    items.push({
      localId: nextLocalId(),
      name: file.name || 'file',
      sizeBytes: file.size,
      contentType: file.type || 'application/octet-stream',
      blob: file.blob,
      ...(origin ? { origin } : {}),
      status: 'selected',
    });
  }
  return { items, rejected };
}

export function rejectionCopy(
  rejected: readonly SelectionRejection[],
  limits: Pick<MrOneHookPlanLimits, 'maxAttachmentsPerMessage'>
): string {
  if (rejected.length === 0) return '';
  const tooLarge = rejected.filter((r) => r.reason === 'TOO_LARGE').map((r) => r.name);
  const tooMany = rejected.some((r) => r.reason === 'TOO_MANY');
  const parts: string[] = [];
  if (tooLarge.length)
    parts.push(`${tooLarge.join(', ')} ${tooLarge.length === 1 ? 'is' : 'are'} over 5 MB.`);
  if (tooMany) parts.push(`You can add up to ${limits.maxAttachmentsPerMessage} files.`);
  return parts.join(' ');
}

/**
 * What the composer's send button does:
 *   • GET_PRO  — Free with files selected: "Get Mr OneHook Pro" opens the Pro screen;
 *   • WAIT     — Pro, a file is still uploading or being read;
 *   • FIX      — Pro, a file failed: remove it first;
 *   • SEND     — send the message (with the READY ids); files alone are enough, the text may be empty;
 *   • DISABLED — nothing to send (no text and no files).
 */
export type ComposerAction = 'SEND' | 'GET_PRO' | 'WAIT' | 'FIX' | 'DISABLED';

export function composerAction(
  plan: MrOneHookPlan,
  items: readonly PendingAttachment[],
  text: string
): ComposerAction {
  if (items.length > 0 && plan !== MrOneHookPlan.PRO) return 'GET_PRO';
  if (items.some((i) => i.status === 'failed')) return 'FIX';
  if (items.some((i) => i.status !== 'ready')) return 'WAIT';
  // Every file is ready here, so one file is a turn on its own (sent with `message: ""`).
  return text.trim() || items.length > 0 ? 'SEND' : 'DISABLED';
}

export function readyAttachmentIds(items: readonly PendingAttachment[]): string[] {
  return items
    .filter((i) => i.status === 'ready' && i.attachmentId)
    .map((i) => i.attachmentId as string);
}

/** One call's result: the attachment, or the HTTP failure (status + error body). A network error throws. */
export type AttachmentCallResult =
  | { ok: true; attachment: ChatAttachment }
  | { ok: false; status: number; body: Record<string, unknown> };

export interface AttachmentDeps {
  upload: (input: {
    body: Uint8Array;
    contentType: string;
    /** Already percent-encoded. */
    fileName: string;
    matchId?: string;
    sender?: ExcerptSpeaker;
  }) => Promise<AttachmentCallResult>;
  get: (attachmentId: string) => Promise<AttachmentCallResult>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** True once the caller no longer wants updates (the chip was removed, the chat closed). */
  cancelled?: () => boolean;
}

/**
 * `GetChatAttachment` allows 60 calls a minute per member, shared by every file being read. The gate
 * spaces calls at least `minGapMs` apart across all files (1 s keeps three files polling at once within
 * the budget, each still about every 3 s).
 */
export const ATTACHMENT_POLL_MIN_GAP_MS = 1000;

export function createPollGate(
  minGapMs: number,
  now: () => number,
  sleep: (ms: number) => Promise<void>
): () => Promise<void> {
  let nextAllowed = 0;
  return async () => {
    const at = Math.max(now(), nextAllowed);
    nextAllowed = at + minGapMs;
    const wait = at - now();
    if (wait > 0) await sleep(wait);
  };
}

/** `X-Attachment-Name` is percent-encoded UTF-8 (1 to 255 characters once decoded). */
export function encodeAttachmentName(name: string): string {
  const trimmed = (name || 'file').slice(0, 255);
  return encodeURIComponent(trimmed);
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function fromAttachment(item: PendingAttachment, a: ChatAttachment): PendingAttachment {
  const next: PendingAttachment = {
    ...item,
    attachmentId: a.attachmentId,
    kind: a.kind,
    problem: undefined,
  };
  if (a.status === AttachmentStatus.READY) return { ...next, status: 'ready' };
  if (a.status === AttachmentStatus.FAILED) {
    return {
      ...next,
      status: 'failed',
      ...(a.failureReason ? { failureReason: a.failureReason } : {}),
    };
  }
  return { ...next, status: 'processing' };
}

/**
 * Runs one file through upload and polling, reporting every state change. Resolves with the final
 * state (`ready` or `failed`), or the last state when cancelled.
 */
export async function runAttachment(
  initial: PendingAttachment,
  deps: AttachmentDeps,
  onChange: (item: PendingAttachment) => void
): Promise<PendingAttachment> {
  let item = initial;
  const update = (next: PendingAttachment) => {
    item = next;
    if (!deps.cancelled?.()) onChange(next);
  };

  if (!item.attachmentId) {
    if (!item.blob) {
      update({ ...item, status: 'failed', problem: { kind: 'INVALID' } });
      return item;
    }
    update({ ...item, status: 'uploading', problem: undefined });
    let result: AttachmentCallResult;
    try {
      result = await deps.upload({
        body: await blobBytes(item.blob),
        contentType: item.contentType,
        fileName: encodeAttachmentName(item.name),
        ...(item.origin ? { matchId: item.origin.matchId, sender: item.origin.sender } : {}),
      });
    } catch {
      update({ ...item, status: 'failed', problem: { kind: 'UNAVAILABLE' } });
      return item;
    }
    if (deps.cancelled?.()) return item;
    if (result.ok === false) {
      update({
        ...item,
        status: 'failed',
        problem: classifyAttachmentError(result.status, result.body),
      });
      return item;
    }
    update(fromAttachment(item, result.attachment));
  } else if (item.status !== 'processing') {
    update({ ...item, status: 'processing', problem: undefined });
  }

  const started = deps.now();
  let networkErrors = 0;
  while (item.status === 'processing') {
    if (deps.cancelled?.()) return item;
    if (deps.now() - started > ATTACHMENT_POLL_TIMEOUT_MS) {
      update({ ...item, status: 'failed', problem: { kind: 'UNAVAILABLE' } });
      return item;
    }
    await deps.sleep(ATTACHMENT_POLL_INTERVAL_MS);
    if (deps.cancelled?.()) return item;
    let result: AttachmentCallResult;
    try {
      result = await deps.get(item.attachmentId as string);
      networkErrors = 0;
    } catch {
      networkErrors += 1;
      if (networkErrors >= 3) {
        update({ ...item, status: 'failed', problem: { kind: 'UNAVAILABLE' } });
        return item;
      }
      continue;
    }
    if (result.ok === false) {
      const problem = classifyAttachmentError(result.status, result.body);
      if (problem.kind === 'RATE_LIMITED' || problem.kind === 'NOT_READY') {
        await deps.sleep(ATTACHMENT_POLL_BACKOFF_MS);
        continue;
      }
      update({ ...item, status: 'failed', problem });
      return item;
    }
    update(fromAttachment(item, result.attachment));
  }
  return item;
}
