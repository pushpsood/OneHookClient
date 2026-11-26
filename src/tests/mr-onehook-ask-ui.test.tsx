// @vitest-environment jsdom
/**
 * "Ask Mr OneHook about messages and files", rendered in a DOM (jsdom + Testing Library):
 *
 *   - the match chat's select mode (the real MatchConversation; its chat, call and live-location hooks
 *     are faked): which messages can be selected, the limits, a match whose history may not be used,
 *     Free vs Pro, the confirmation (nothing is sent before it; "Don't share" sends nothing), the
 *     upload of files after confirming, and the hand-off to the Mr OneHook chat;
 *   - the Mr OneHook chat with that hand-off (the real MrOneHookChatBody and useMrOneHookChat, only the
 *     network faked): the exact request body (`ephemeralMessageContext` with `userConfirmed: true`, plus
 *     `attachmentIds`), and a 403 MESSAGE_CONTEXT_NOT_ALLOWED;
 *   - the telemetry id and value of every control (resolved as the delegated click listener does).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AttachmentKind, AttachmentStatus, MrOneHookPlan } from 'onehook-mr-onehook-client';
import { mrOneHookClient } from '../api/external-sdk-clients';
import { MatchConversation, MrOneHookChatBody, type AskHandoff } from '../features/chat/ChatView';
import { ToastProvider } from '../components/common/Toast';
import { MESSAGE_HISTORY_NOT_ALLOWED_COPY, useMrOneHookChat } from '../lib/mr-onehook';
import { CHAT_WALLPAPERS } from '../lib/chat-appearance';
import { FREE_PLAN_FALLBACK_LIMITS, type MrOneHookPlanContext } from '../lib/mr-onehook-pro';
import { uiInteractionFromTarget } from '../lib/analytics/uiTracking';
import { openMrOneHookPro } from '../store/mr-onehook-pro-store';
import { frameAttachment, type AttachmentEnvelope } from '../lib/chat-attachments';
import { frameStructuredContent } from '../lib/chat-structured';
import {
  ASK_HISTORY_NOT_ALLOWED_COPY,
  askCharacterLimitCopy,
  askMessageLimitCopy,
  isMessageHistoryNotAllowed,
  noteMessageHistoryNotAllowed,
  resetMessageHistoryPolicy,
} from '../lib/mr-onehook-ask';
import type { SelectedExcerpt } from '../lib/mr-onehook-excerpts';
import type { PendingAttachment } from '../lib/mr-onehook-attachments';

const fake = vi.hoisted(() => ({
  messages: [] as unknown[],
  resolveBlob: vi.fn(),
}));

vi.mock('heic2any', () => ({ default: vi.fn() }));

vi.mock('../api/external-sdk-clients', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/external-sdk-clients')>()),
  fetchIdToken: vi.fn(async () => 'test-token'),
}));

vi.mock('../store/mr-onehook-pro-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store/mr-onehook-pro-store')>()),
  openMrOneHookPro: vi.fn(),
}));

vi.mock('../lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/analytics/analytics')>()),
  trackUi: vi.fn(),
  trackScreenView: vi.fn(),
  trackConversationOpened: vi.fn(),
}));

// The conversation's E2EE message hook: the decrypted messages of this test, nothing on the network.
vi.mock('../hooks/use-api', async (importOriginal) => {
  const noop = () => undefined;
  const cache = {
    peek: () => undefined,
    resolve: () => new Promise<string>(() => undefined),
    resolveBlob: (...args: unknown[]) => fake.resolveBlob(...args),
  };
  const stable = {
    loading: false,
    error: null,
    sendMessage: async () => undefined,
    sendAttachment: async () => undefined,
    retryAttachment: async () => undefined,
    attachmentTransfers: {},
    attachmentCache: cache,
    markAsDelivered: noop,
    markAsRead: noop,
    refetch: async () => undefined,
    loadEvidenceWindow: async () => [],
    hasUndecryptable: false,
    historyHorizon: undefined,
    decryptPayload: undefined,
    sealPayload: async () => '',
  };
  return {
    ...(await importOriginal<typeof import('../hooks/use-api')>()),
    useChatMessages: () => ({ ...stable, messages: fake.messages }),
  };
});
vi.mock('../hooks/use-calls', async (importOriginal) => {
  const eligibility = { locked: false, lockMessage: '', reason: null, recheck: () => undefined };
  return {
    ...(await importOriginal<typeof import('../hooks/use-calls')>()),
    useCallEligibility: () => eligibility,
  };
});
vi.mock('../app/CallProvider', async (importOriginal) => {
  const call = { active: false, historyNonce: 0, startCall: async () => undefined };
  return { ...(await importOriginal<typeof import('../app/CallProvider')>()), useCall: () => call };
});
vi.mock('../api/calls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/calls')>();
  return { ...actual, CallApi: { ...actual.CallApi, getCallHistory: async () => [] } };
});
vi.mock('../hooks/use-live-locations', () => {
  const state = { sessions: {} };
  return { useLiveLocations: () => state };
});
vi.mock('../hooks/use-live-sharing', () => {
  const snapshot = { shares: {}, ended: {}, lowPower: false };
  const engine = { stop: async () => undefined, stopRemote: async () => undefined, share: () => undefined, begin: async () => undefined };
  return { useLiveSharing: () => snapshot, liveSharing: () => engine };
});

const MiB = 1024 * 1024;
const proLimits = { maxSessions: 3, attachmentsAllowed: true, maxAttachmentBytes: 5 * MiB, maxAttachmentsPerMessage: 3 };
const PRO: MrOneHookPlanContext = { plan: MrOneHookPlan.PRO, limits: proLimits, proVisible: true };
const FREE: MrOneHookPlanContext = { plan: MrOneHookPlan.FREE, limits: FREE_PLAN_FALLBACK_LIMITS, proVisible: true };
const PRO_OFF: MrOneHookPlanContext = { plan: MrOneHookPlan.FREE, limits: FREE_PLAN_FALLBACK_LIMITS, proVisible: false };

const MATCH = 'match-1';
const T0 = Date.UTC(2026, 10, 1, 9, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

const envelope = (over: Partial<AttachmentEnvelope> = {}): AttachmentEnvelope => ({
  v: 1,
  kind: 'file',
  objectKey: `${MATCH}/obj-1`,
  contentKey: 'a2V5',
  nonce: 'bm9uY2U=',
  mime: 'application/pdf',
  name: 'ticket.pdf',
  size: 2048,
  ...over,
});

type View = {
  messageId: string;
  matchId: string;
  senderId: string;
  ciphertext: string;
  timestamp: number;
  status: string;
  undecryptable?: boolean;
};
const view = (messageId: string, senderId: string, ciphertext: string, timestamp: number, over: Partial<View> = {}): View => ({
  messageId,
  matchId: MATCH,
  senderId,
  ciphertext,
  timestamp,
  status: 'READ',
  ...over,
});

/** A conversation with every kind of message the select mode must tell apart. */
const conversation = (): View[] => [
  view('hi', 'me', 'Hi Riya!', T0),
  view('reply', 'peer-1', 'Dinner at 8 on Friday?', T0 + 60_000),
  view('locked', 'peer-1', '', T0 + 120_000, { undecryptable: true }),
  view('unreadable', 'peer-1', '[Unable to decrypt]', T0 + 180_000),
  view('failed', 'me', 'this one did not send', T0 + 240_000, { status: 'FAILED' }),
  view('place', 'peer-1', frameStructuredContent({ v: 1, type: 'location', lat: 12.97, lon: 77.59 }), T0 + 300_000),
  view('ticket', 'peer-1', frameAttachment(envelope()), T0 + 360_000),
];

let onAsk: ReturnType<typeof vi.fn>;
function renderMatch(pro: MrOneHookPlanContext = PRO) {
  onAsk = vi.fn();
  return render(
    <ToastProvider>
      <MatchConversation
        matchId={MATCH}
        peerName="Riya"
        currentUserId="me-id"
        wallpaper={CHAT_WALLPAPERS[0]}
        pro={pro}
        onAskMrOneHook={onAsk as (handoff: AskHandoff) => void}
      />
    </ToastProvider>
  );
}

const entry = () => screen.getByRole('button', { name: /^Ask Mr OneHook about messages/ });
const checkbox = (name: RegExp) => screen.getByRole('checkbox', { name });
const bar = () => screen.getByTestId('ask-mr-onehook-bar');
const askButton = () => within(bar()).getAllByRole('button').at(-1) as HTMLButtonElement;
const dialog = () => screen.getByRole('dialog');

let uploadSpy: ReturnType<typeof vi.spyOn>;
let chatSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

beforeEach(() => {
  window.localStorage?.clear();
  resetMessageHistoryPolicy();
  fake.messages = conversation();
  fake.resolveBlob.mockReset();
  fake.resolveBlob.mockImplementation(async () => new Blob([new Uint8Array(2048)], { type: 'application/pdf' }));
  vi.mocked(openMrOneHookPro).mockClear();
  let n = 0;
  uploadSpy = vi.spyOn(mrOneHookClient, 'uploadChatAttachment').mockImplementation((async () => {
    n += 1;
    return {
      $metadata: {},
      attachment: { attachmentId: `att-${n}`, status: AttachmentStatus.READY, kind: AttachmentKind.DOCUMENT },
    };
  }) as never);
  chatSpy = vi.spyOn(mrOneHookClient, 'productConnectionChat').mockImplementation((async () => ({
    $metadata: {},
    reply: 'Sounds like a yes to Friday.',
    mood: 'Happy',
    needsMoreContext: false,
    plan: MrOneHookPlan.PRO,
  })) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the match chat: select mode', () => {
  it('one entry point for messages and files, reporting chat.select_open = header', () => {
    renderMatch();
    expect(entry().textContent).toContain('Ask Mr OneHook about messages and files');
    expect(uiInteractionFromTarget(entry())).toEqual({ elementId: 'chat.select_open', action: 'tap', value: 'header' });
    // With Pro off in this environment, only messages are offered.
    cleanup();
    renderMatch(PRO_OFF);
    expect(entry().textContent).toContain('Ask Mr OneHook about messages');
    expect(entry().textContent).not.toContain('files');
  });

  it('only shareable messages get a checkbox: readable text and files; not locked, unreadable, failed or a location', () => {
    renderMatch();
    fireEvent.click(entry());
    const boxes = screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-label'));
    expect(boxes).toEqual([
      'Select the message “Hi Riya!” for Mr OneHook',
      'Select the message “Dinner at 8 on Friday?” for Mr OneHook',
      'Select ticket.pdf for Mr OneHook',
    ]);
    expect(bar().textContent).toContain('Select messages, or up to 3 photos or files');
  });

  it('a message and a file toggle with chat.select_toggle (selected / deselected)', () => {
    renderMatch();
    fireEvent.click(entry());
    const message = checkbox(/Dinner at 8/);
    expect(uiInteractionFromTarget(message)).toEqual({ elementId: 'chat.select_toggle', action: 'tap', value: 'selected' });
    fireEvent.click(message);
    expect(message.getAttribute('aria-checked')).toBe('true');
    expect(uiInteractionFromTarget(message)).toEqual({ elementId: 'chat.select_toggle', action: 'tap', value: 'deselected' });
    const file = checkbox(/ticket\.pdf/);
    expect(uiInteractionFromTarget(file)).toEqual({ elementId: 'chat.select_toggle', action: 'tap', value: 'selected' });
    fireEvent.click(file);
    expect(bar().textContent).toContain('1 message and 1 file selected');
    fireEvent.click(message);
    expect(message.getAttribute('aria-checked')).toBe('false');
    expect(bar().textContent).toContain('1 file selected');
  });

  it('Cancel in the bar reports chat.select_cancel and ends the selection', () => {
    renderMatch();
    fireEvent.click(entry());
    const cancel = within(bar()).getByRole('button', { name: 'Cancel' });
    expect(uiInteractionFromTarget(cancel)).toEqual({ elementId: 'chat.select_cancel', action: 'tap' });
    fireEvent.click(cancel);
    expect(screen.queryByTestId('ask-mr-onehook-bar')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('the limits, in the bar', () => {
  it('30 messages at a time', () => {
    fake.messages = Array.from({ length: 31 }, (_, i) => view(`t${i}`, i % 2 ? 'peer-1' : 'me', `message number ${i}`, T0 + i * 1000));
    renderMatch();
    fireEvent.click(entry());
    const boxes = screen.getAllByRole('checkbox');
    for (const box of boxes.slice(0, 30)) fireEvent.click(box);
    expect(bar().textContent).toContain('30 messages selected');
    fireEvent.click(boxes[30]);
    expect(boxes[30].getAttribute('aria-checked')).toBe('false');
    expect(bar().textContent).toContain(askMessageLimitCopy(30));
  });

  it('12,000 characters in all', () => {
    fake.messages = [0, 1, 2, 3].map((i) => view(`c${i}`, 'me', `${i}`.repeat(4000), T0 + i * 1000));
    renderMatch();
    fireEvent.click(entry());
    const boxes = screen.getAllByRole('checkbox');
    for (const box of boxes.slice(0, 3)) fireEvent.click(box);
    fireEvent.click(boxes[3]);
    expect(boxes[3].getAttribute('aria-checked')).toBe('false');
    expect(bar().textContent).toContain(askCharacterLimitCopy(12000));
  });

  it('a file over 5 MB is refused with a notice', () => {
    fake.messages = [view('big', 'me', frameAttachment(envelope({ name: 'video.mov', size: 6 * MiB })), T0)];
    renderMatch();
    fireEvent.click(entry());
    fireEvent.click(checkbox(/video\.mov/));
    expect(checkbox(/video\.mov/).getAttribute('aria-checked')).toBe('false');
    expect(bar().textContent).toContain('Files over 5 MB can’t be shared with Mr OneHook.');
  });
});

describe('a match whose history Mr OneHook may not use', () => {
  it('offers no message selection, says why, and keeps file selection', () => {
    noteMessageHistoryNotAllowed(MATCH);
    renderMatch();
    fireEvent.click(entry());
    expect(screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Select ticket.pdf for Mr OneHook',
    ]);
    expect(bar().textContent).toContain(`${ASK_HISTORY_NOT_ALLOWED_COPY} You can still select files.`);
    expect(bar().textContent).toContain('Select up to 3 photos or files');
  });

  it('without files on offer, the entry still opens to explain', () => {
    noteMessageHistoryNotAllowed(MATCH);
    renderMatch(PRO_OFF);
    fireEvent.click(entry());
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(bar().textContent).toContain('Nothing to select');
    expect(bar().textContent).toContain(ASK_HISTORY_NOT_ALLOWED_COPY);
  });

  it('a 403 MESSAGE_CONTEXT_NOT_ALLOWED on upload is explained and turns message selection off', async () => {
    uploadSpy.mockImplementation((async () => {
      throw Object.assign(new Error('forbidden'), { $metadata: { httpStatusCode: 403 }, error: 'MESSAGE_CONTEXT_NOT_ALLOWED' });
    }) as never);
    renderMatch();
    fireEvent.click(entry());
    fireEvent.click(checkbox(/ticket\.pdf/));
    fireEvent.click(askButton());
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Share & ask' }));
    });
    await waitFor(() => expect(bar().textContent).toContain("files they sent can't be shared"));
    expect(onAsk).not.toHaveBeenCalled();
    expect(isMessageHistoryNotAllowed(MATCH)).toBe(true);
    expect(screen.queryByRole('checkbox', { name: /Dinner at 8/ })).toBeNull();
  });
});

describe('Free plan', () => {
  it('messages alone: "Ask Mr OneHook" (chat.select_ask_mr_onehook) opens the confirmation', () => {
    renderMatch(FREE);
    fireEvent.click(entry());
    fireEvent.click(checkbox(/Dinner at 8/));
    expect(askButton().textContent).toBe('Ask Mr OneHook');
    expect(uiInteractionFromTarget(askButton())).toEqual({ elementId: 'chat.select_ask_mr_onehook', action: 'tap' });
    fireEvent.click(askButton());
    expect(dialog()).toBeTruthy();
    expect(openMrOneHookPro).not.toHaveBeenCalled();
  });

  it('with a file: "Get Mr OneHook Pro" (ask_from_chat) opens the Pro screen and keeps the selection', () => {
    renderMatch(FREE);
    fireEvent.click(entry());
    fireEvent.click(checkbox(/Dinner at 8/));
    fireEvent.click(checkbox(/ticket\.pdf/));
    expect(askButton().textContent).toBe('Get Mr OneHook Pro');
    expect(uiInteractionFromTarget(askButton())).toEqual({
      elementId: 'chat.mr_onehook_get_pro',
      action: 'tap',
      value: 'ask_from_chat',
    });
    fireEvent.click(askButton());
    expect(openMrOneHookPro).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(checkbox(/ticket\.pdf/).getAttribute('aria-checked')).toBe('true');
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});

describe('the confirmation', () => {
  it('shows exactly what will be shared; nothing is sent or uploaded before "Share & ask"', async () => {
    renderMatch(PRO);
    fireEvent.click(entry());
    // Picked out of order: the confirmation (and the request) are oldest first.
    fireEvent.click(checkbox(/ticket\.pdf/));
    fireEvent.click(checkbox(/Dinner at 8/));
    fireEvent.click(checkbox(/Hi Riya/));
    fireEvent.click(askButton());

    const confirm = dialog();
    expect(within(confirm).getByRole('heading').textContent).toBe('Ask Mr OneHook about these 2 messages and 1 file?');
    const items = within(confirm).getByTestId('ask-mr-onehook-confirm-items').querySelectorAll('li');
    expect([...items].map((li) => li.querySelector('p')!.textContent)).toEqual([
      'Hi Riya!',
      'Dinner at 8 on Friday?',
      'ticket.pdf',
    ]);
    expect(items[0].textContent).toContain('You');
    expect(items[1].textContent).toContain('Riya');
    expect(confirm.textContent).toContain('from your chat with Riya');
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(fake.resolveBlob).not.toHaveBeenCalled();
    expect(chatSpy).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();

    const share = within(confirm).getByRole('button', { name: 'Share & ask' });
    expect(uiInteractionFromTarget(share)).toEqual({ elementId: 'chat.mr_onehook_context_share', action: 'submit' });
    await act(async () => {
      fireEvent.click(share);
    });
    await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
    // The file was decrypted on this device and uploaded once, as the match's file from Riya.
    expect(fake.resolveBlob).toHaveBeenCalledWith(envelope(), MATCH);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy.mock.calls[0][0]).toMatchObject({ matchId: MATCH, sender: 'match', fileName: 'ticket.pdf' });
    const handoff = onAsk.mock.calls[0][0] as AskHandoff;
    expect(handoff.excerpts).toEqual([
      { speaker: 'self', sentAt: iso(T0), text: 'Hi Riya!' },
      { speaker: 'match', sentAt: iso(T0 + 60_000), text: 'Dinner at 8 on Friday?' },
    ]);
    expect(handoff.items).toHaveLength(1);
    expect(handoff.items[0]).toMatchObject({ attachmentId: 'att-1', status: 'ready', origin: { matchId: MATCH, sender: 'match' } });
    // Still nothing asked: the question comes next, in the Mr OneHook chat.
    expect(chatSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('ask-mr-onehook-bar')).toBeNull();
  });

  it('messages only: confirming hands them over without any upload', async () => {
    renderMatch(FREE);
    fireEvent.click(entry());
    fireEvent.click(checkbox(/Dinner at 8/));
    fireEvent.click(askButton());
    expect(within(dialog()).getByRole('heading').textContent).toBe('Ask Mr OneHook about this message?');
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Share & ask' }));
    });
    expect(onAsk).toHaveBeenCalledWith({
      items: [],
      excerpts: [{ speaker: 'match', sentAt: iso(T0 + 60_000), text: 'Dinner at 8 on Friday?' }],
    });
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('"Don\'t share" sends nothing, reports chat.select_cancel and ends the selection', async () => {
    renderMatch(PRO);
    fireEvent.click(entry());
    fireEvent.click(checkbox(/Dinner at 8/));
    fireEvent.click(checkbox(/ticket\.pdf/));
    fireEvent.click(askButton());
    const cancel = within(dialog()).getByRole('button', { name: 'Don’t share' });
    expect(uiInteractionFromTarget(cancel)).toEqual({ elementId: 'chat.select_cancel', action: 'tap' });
    await act(async () => {
      fireEvent.click(cancel);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('ask-mr-onehook-bar')).toBeNull();
    expect(onAsk).not.toHaveBeenCalled();
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(fake.resolveBlob).not.toHaveBeenCalled();
    expect(chatSpy).not.toHaveBeenCalled();
  });

  it('marks a shortened message', () => {
    fake.messages = [view('long', 'peer-1', 'z'.repeat(4500), T0)];
    renderMatch(FREE);
    fireEvent.click(entry());
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(askButton());
    const text = within(dialog()).getByTestId('ask-mr-onehook-confirm-items').querySelector('li p')!.textContent!;
    expect(text).toBe(`${'z'.repeat(4000)}…`);
    expect(dialog().textContent).toContain('Long messages are shortened to 4,000 characters');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The Mr OneHook chat with the hand-off
// ─────────────────────────────────────────────────────────────────────────────

const EXCERPTS: SelectedExcerpt[] = [
  { speaker: 'self', sentAt: iso(T0), text: 'Hi Riya!' },
  { speaker: 'match', sentAt: iso(T0 + 60_000), text: 'Dinner at 8 on Friday?' },
];
const READY_FILE: PendingAttachment = {
  localId: 'l-1',
  name: 'ticket.pdf',
  sizeBytes: 2048,
  contentType: 'application/pdf',
  origin: { matchId: MATCH, sender: 'match' },
  status: 'ready',
  attachmentId: 'att-9',
  kind: AttachmentKind.DOCUMENT,
};

function MatchChat({ pro, handoff }: { pro: MrOneHookPlanContext; handoff: AskHandoff }) {
  const chat = useMrOneHookChat({ userId: '', scope: { type: 'match', matchId: MATCH } });
  return (
    <MrOneHookChatBody
      chat={chat}
      wallpaper={CHAT_WALLPAPERS[0]}
      pro={pro}
      matchName="Riya"
      scopeType="connection"
      handoff={handoff}
      onHandoffTaken={() => undefined}
    />
  );
}

const renderMrOneHook = (handoff: AskHandoff, pro: MrOneHookPlanContext = PRO) =>
  render(
    <ToastProvider>
      <MatchChat pro={pro} handoff={handoff} />
    </ToastProvider>
  );

const field = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
const sendButton = () => {
  const buttons = field().parentElement!.querySelectorAll('button');
  return buttons[buttons.length - 1] as HTMLButtonElement;
};
async function ask(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  await act(async () => {
    fireEvent.click(sendButton());
  });
}

describe('the Mr OneHook chat: the confirmed messages go with the next question', () => {
  it('shows what goes with the question; needs a question; sends ephemeralMessageContext with userConfirmed: true once', async () => {
    renderMrOneHook({ items: [], excerpts: EXCERPTS }, FREE);
    const about = await screen.findByTestId('mr-onehook-asking-about');
    expect(about.textContent).toContain('Asking about 2 messages');
    expect(about.textContent).toContain('Hi Riya! · Dinner at 8 on Friday?');
    expect(field().placeholder).toBe('Ask about these messages…');
    // Nothing is sent without a question.
    expect(sendButton().disabled).toBe(true);
    expect(chatSpy).not.toHaveBeenCalled();

    await ask('Is she free on Friday?');
    expect(chatSpy).toHaveBeenCalledTimes(1);
    const body = chatSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toEqual({
      message: 'Is she free on Friday?',
      matchId: MATCH,
      contextOptions: { includeProfile: true, includeMessageHistory: true },
      ephemeralMessageContext: {
        excerpts: [
          { speaker: 'self', sentAt: iso(T0), text: 'Hi Riya!' },
          { speaker: 'match', sentAt: iso(T0 + 60_000), text: 'Dinner at 8 on Friday?' },
        ],
        historyTruncated: true,
        userConfirmed: true,
      },
    });
    await screen.findByText('Sounds like a yes to Friday.');
    expect(screen.queryByTestId('mr-onehook-asking-about')).toBeNull();

    // The next question goes without them.
    await ask('And Saturday?');
    expect(chatSpy).toHaveBeenCalledTimes(2);
    expect('ephemeralMessageContext' in (chatSpy.mock.calls[1][0] as object)).toBe(false);
  });

  it('Pro: messages and files together send ephemeralMessageContext and attachmentIds', async () => {
    renderMrOneHook({ items: [READY_FILE], excerpts: EXCERPTS }, PRO);
    await screen.findByTestId('mr-onehook-asking-about');
    expect(screen.getByTestId('mr-onehook-attachment-chips').textContent).toContain('ticket.pdf');
    await ask('What time is the flight?');
    const body = chatSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      message: 'What time is the flight?',
      matchId: MATCH,
      attachmentIds: ['att-9'],
      ephemeralMessageContext: { excerpts: EXCERPTS, historyTruncated: true, userConfirmed: true },
    });
  });

  it('removing them (chat.mr_onehook_context_share dismiss) sends the question without them', async () => {
    renderMrOneHook({ items: [], excerpts: EXCERPTS });
    const remove = await screen.findByRole('button', { name: 'Remove the shared messages' });
    expect(uiInteractionFromTarget(remove)).toEqual({ elementId: 'chat.mr_onehook_context_share', action: 'dismiss' });
    fireEvent.click(remove);
    expect(screen.queryByTestId('mr-onehook-asking-about')).toBeNull();
    await ask('Hello');
    expect('ephemeralMessageContext' in (chatSpy.mock.calls[0][0] as object)).toBe(false);
  });

  it('a 403 MESSAGE_CONTEXT_NOT_ALLOWED: explained, the messages are taken out, the question is kept', async () => {
    chatSpy.mockImplementationOnce((async () => {
      throw Object.assign(new Error('forbidden'), { $metadata: { httpStatusCode: 403 }, error: 'MESSAGE_CONTEXT_NOT_ALLOWED' });
    }) as never);
    renderMrOneHook({ items: [], excerpts: EXCERPTS }, FREE);
    await screen.findByTestId('mr-onehook-asking-about');
    await ask('Is she free on Friday?');
    expect(await screen.findByText(MESSAGE_HISTORY_NOT_ALLOWED_COPY)).toBeTruthy();
    expect(screen.queryByTestId('mr-onehook-asking-about')).toBeNull();
    expect(field().value).toBe('Is she free on Friday?');
    expect(isMessageHistoryNotAllowed(MATCH)).toBe(true);
  });
});
