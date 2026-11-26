// @vitest-environment jsdom
/**
 * The Mr OneHook composer and its file picker, rendered in a DOM (jsdom + Testing Library) with the
 * real chat hook (useMrOneHookChat) and the real attachment hook; only the network is faked (spies on
 * the generated `mrOneHookClient`) and heic2any is mocked (it needs a browser Worker).
 *
 *   - Pro: attach a file -> upload -> "Ready" chip; remove it; send with files and NO text
 *     (`message: ""` + `attachmentIds`, the turn reads "Please look at the attached files.");
 *   - empty text with no files keeps Send disabled;
 *   - HEIC: converted to JPEG before upload, or uploaded as is when conversion fails;
 *   - Free: files can be selected, nothing uploads, the button reads "Get Mr OneHook Pro" and opens Pro;
 *   - each control reports the catalog id it describes (resolved as the delegated click listener does),
 *     including the Mr OneHook chat header's Pro button and Settings' "Get / Manage Mr OneHook Pro".
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttachmentKind, AttachmentStatus, MrOneHookPlan } from 'onehook-mr-onehook-client';
import { mrOneHookClient } from '../api/external-sdk-clients';
import { MrOneHookChatBody, MrOneHookConversation } from '../features/chat/ChatView';
import { SettingsView } from '../features/settings/SettingsView';
import type { UserProfile } from '../types';
import { AskMrOneHookButton } from '../components/chat/MrOneHookAttachments';
import { ToastProvider } from '../components/common/Toast';
import { useMrOneHookChat } from '../lib/mr-onehook';
import { CHAT_WALLPAPERS } from '../lib/chat-appearance';
import { FREE_PLAN_FALLBACK_LIMITS, type MrOneHookPlanContext } from '../lib/mr-onehook-pro';
import { uiInteractionFromTarget } from '../lib/analytics/uiTracking';
import { ATTACHMENTS_ONLY_TURN_TEXT } from '../lib/mr-onehook-contract';
import { openMrOneHookPro, useMrOneHookProStore } from '../store/mr-onehook-pro-store';
import { trackUi } from '../lib/analytics/analytics';

const heic2anyMock = vi.hoisted(() => vi.fn());
vi.mock('heic2any', () => ({ default: heic2anyMock }));

vi.mock('../api/external-sdk-clients', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/external-sdk-clients')>()),
  fetchIdToken: vi.fn(async () => 'test-token'),
}));

vi.mock('../store/mr-onehook-pro-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store/mr-onehook-pro-store')>()),
  openMrOneHookPro: vi.fn(),
}));

// Settings' other cards read the network; they are not under test here.
vi.mock('../components/profile/AppearanceCard', () => ({ AppearanceCard: () => null }));
vi.mock('../components/profile/AccountSettingsCard', () => ({ AccountSettingsCard: () => null }));
vi.mock('../components/profile/DeviceManagementCard', () => ({ DeviceManagementCard: () => null }));
vi.mock('../components/profile/SetPasswordCard', () => ({ SetPasswordCard: () => null }));
vi.mock('../features/settings/MatchingSettingsCard', () => ({ MatchingSettingsCard: () => null }));
vi.mock('../features/settings/MatchingTabToggleCard', () => ({ MatchingTabToggleCard: () => null }));

vi.mock('../lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/analytics/analytics')>()),
  trackUi: vi.fn(),
  trackScreenView: vi.fn(),
}));

const MiB = 1024 * 1024;
const proLimits = {
  maxSessions: 3,
  attachmentsAllowed: true,
  maxAttachmentBytes: 5 * MiB,
  maxAttachmentsPerMessage: 3,
};
const PRO: MrOneHookPlanContext = { plan: MrOneHookPlan.PRO, limits: proLimits, proVisible: true };
const FREE: MrOneHookPlanContext = {
  plan: MrOneHookPlan.FREE,
  limits: FREE_PLAN_FALLBACK_LIMITS,
  proVisible: true,
};

function Harness({ pro }: { pro: MrOneHookPlanContext }) {
  // userId '' : no saved chats (no session list calls); every turn goes through ProductConnectionChat.
  const chat = useMrOneHookChat({ userId: '', scope: { type: 'product' } });
  return (
    <MrOneHookChatBody chat={chat} wallpaper={CHAT_WALLPAPERS[0]} pro={pro} scopeType="product" />
  );
}

const renderComposer = (pro: MrOneHookPlanContext = PRO) =>
  render(
    <ToastProvider>
      <Harness pro={pro} />
    </ToastProvider>
  );

/** The send button: the last button in the message field's row (after the paperclip). */
const sendButton = () => {
  const row = screen.getByRole('textbox', { name: 'Message' }).parentElement!;
  const buttons = row.querySelectorAll('button');
  return buttons[buttons.length - 1] as HTMLButtonElement;
};

function pick(files: File[]) {
  const input = screen.getByTestId('mr-onehook-file-input') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  fireEvent.change(input);
}

const fileOf = (name: string, type: string, size = 64) =>
  new File([new Uint8Array(size)], name, { type });

let uploadSpy: ReturnType<typeof vi.spyOn>;
let chatSpy: ReturnType<typeof vi.spyOn>;
let contentSpy: ReturnType<typeof vi.spyOn>;
let uploads: Array<{ contentType: string; fileName: string; size: number }>;

beforeAll(() => {
  // jsdom has no layout: the transcript scrolls itself into view after each message.
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom's Blob has no arrayBuffer() (browsers do); the upload reads the bytes with it.
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
  heic2anyMock.mockReset();
  vi.mocked(openMrOneHookPro).mockClear();
  vi.mocked(trackUi).mockClear();
  uploads = [];
  let n = 0;
  uploadSpy = vi.spyOn(mrOneHookClient, 'uploadChatAttachment').mockImplementation((async (input: {
    body: Uint8Array;
    contentType: string;
    fileName: string;
  }) => {
    n += 1;
    uploads.push({ contentType: input.contentType, fileName: input.fileName, size: input.body.byteLength });
    return {
      $metadata: {},
      attachment: {
        attachmentId: `att-${n}`,
        status: AttachmentStatus.READY,
        kind: input.contentType.startsWith('image/') ? AttachmentKind.IMAGE : AttachmentKind.DOCUMENT,
      },
    };
  }) as never);
  chatSpy = vi.spyOn(mrOneHookClient, 'productConnectionChat').mockImplementation((async () => ({
    $metadata: {},
    reply: 'It is a boarding pass for Delhi.',
    mood: 'Happy',
    needsMoreContext: false,
    plan: MrOneHookPlan.PRO,
  })) as never);
  contentSpy = vi.spyOn(mrOneHookClient, 'getChatAttachmentContent').mockImplementation((async () => ({
    $metadata: {},
    body: new Uint8Array([1, 2, 3]),
    contentType: 'application/pdf',
  })) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Pro: attach, remove and send files', () => {
  it('the paperclip opens the picker and reports chat.mr_onehook_attach_open', () => {
    renderComposer();
    const attach = screen.getByRole('button', { name: 'Attach files for Mr OneHook' });
    expect(uiInteractionFromTarget(attach)).toEqual({ elementId: 'chat.mr_onehook_attach_open', action: 'tap' });
    const input = screen.getByTestId('mr-onehook-file-input') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(attach);
    expect(click).toHaveBeenCalled();
    // Closing the picker without choosing is the element's `dismiss`.
    fireEvent(input, new Event('cancel'));
    expect(trackUi).toHaveBeenCalledWith('chat.mr_onehook_attach_open', { action: 'dismiss' });
  });

  it('an attached file uploads, shows "Ready", and can be removed', async () => {
    renderComposer();
    pick([fileOf('ticket.pdf', 'application/pdf')]);
    const chips = await screen.findByTestId('mr-onehook-attachment-chips');
    expect(chips.textContent).toContain('ticket.pdf');
    await waitFor(() => expect(chips.querySelector('li')!.getAttribute('data-status')).toBe('ready'));
    expect(chips.textContent).toContain('Ready');
    expect(uploads).toEqual([{ contentType: 'application/pdf', fileName: 'ticket.pdf', size: 64 }]);

    const remove = screen.getByRole('button', { name: 'Remove ticket.pdf' });
    expect(uiInteractionFromTarget(remove)).toEqual({ elementId: 'chat.mr_onehook_attachment_remove', action: 'tap' });
    fireEvent.click(remove);
    expect(screen.queryByTestId('mr-onehook-attachment-chips')).toBeNull();
    // Nothing left to send.
    expect(sendButton().disabled).toBe(true);
  });

  it('with no files and no text, Send stays disabled', () => {
    renderComposer();
    expect(sendButton().textContent).toBe('Send');
    expect(sendButton().disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: '   ' } });
    expect(sendButton().disabled).toBe(true);
    fireEvent.click(sendButton());
    expect(chatSpy).not.toHaveBeenCalled();
  });

  it('a READY file is enough: Send is enabled with empty text and sends message "" with attachmentIds', async () => {
    renderComposer();
    pick([fileOf('ticket.pdf', 'application/pdf')]);
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveProperty('value', '');
    expect(uiInteractionFromTarget(sendButton())).toMatchObject({ elementId: 'chat.send_button' });

    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(chatSpy).toHaveBeenCalledTimes(1);
    const body = chatSpy.mock.calls[0][0] as { message: string; attachmentIds?: string[] };
    expect(body.message).toBe('');
    expect(body.attachmentIds).toEqual(['att-1']);
    // The turn reads as the server saves it, with its file; the chips are cleared.
    await screen.findByText('It is a boarding pass for Delhi.');
    expect(screen.getByText(ATTACHMENTS_ONLY_TURN_TEXT)).toBeTruthy();
    expect(screen.queryByTestId('mr-onehook-attachment-chips')).toBeNull();

    // The sent file opens (GetChatAttachmentContent) and reports chat.mr_onehook_attachment_open.
    const sent = screen.getByTestId('mr-onehook-sent-attachments').querySelector('button')!;
    expect(uiInteractionFromTarget(sent)).toEqual({ elementId: 'chat.mr_onehook_attachment_open', action: 'tap' });
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await act(async () => {
      fireEvent.click(sent);
    });
    expect(contentSpy).toHaveBeenCalledWith({ attachmentId: 'att-1' });
  });

  it('text with files sends both', async () => {
    renderComposer();
    pick([fileOf('menu.pdf', 'application/pdf')]);
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'What should I order?' } });
    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(chatSpy.mock.calls[0][0]).toMatchObject({ message: 'What should I order?', attachmentIds: ['att-1'] });
  });
});

describe('HEIC photos', () => {
  it('are converted to JPEG before upload', async () => {
    const jpeg = new Blob([new Uint8Array(32)], { type: 'image/jpeg' });
    heic2anyMock.mockResolvedValue(jpeg);
    renderComposer();
    pick([fileOf('IMG_0042.HEIC', '')]);
    const chips = await screen.findByTestId('mr-onehook-attachment-chips');
    expect(chips.textContent).toContain('IMG_0042.jpg');
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(heic2anyMock).toHaveBeenCalledWith(expect.objectContaining({ toType: 'image/jpeg' }));
    expect(uploads[0]).toEqual({ contentType: 'image/jpeg', fileName: 'IMG_0042.jpg', size: 32 });
  });

  it('upload the original file when conversion fails', async () => {
    heic2anyMock.mockImplementation(() => Promise.reject(new Error('ERR_LIBHEIF')));
    renderComposer();
    pick([fileOf('IMG_0043.heic', 'image/heic', 48)]);
    const chips = await screen.findByTestId('mr-onehook-attachment-chips');
    expect(chips.textContent).toContain('IMG_0043.heic');
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]).toEqual({ contentType: 'image/heic', fileName: 'IMG_0043.heic', size: 48 });
  });

  it('a converted JPEG over 5 MB is refused like any other large file', async () => {
    const big = new Blob([new Uint8Array(8)], { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 5 * MiB + 1 });
    heic2anyMock.mockResolvedValue(big);
    renderComposer();
    pick([fileOf('IMG_0044.HEIC', 'image/heic')]);
    expect(await screen.findByText('IMG_0044.jpg is over 5 MB.')).toBeTruthy();
    expect(screen.queryByTestId('mr-onehook-attachment-chips')).toBeNull();
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});

describe('Free plan', () => {
  it('selects files without uploading; the button reads "Get Mr OneHook Pro" and opens the Pro screen', async () => {
    renderComposer(FREE);
    pick([fileOf('ticket.pdf', 'application/pdf')]);
    const chips = await screen.findByTestId('mr-onehook-attachment-chips');
    expect(chips.textContent).toContain('Selected');
    const button = sendButton();
    expect(button.textContent).toBe('Get Mr OneHook Pro');
    expect(button.disabled).toBe(false);
    expect(uiInteractionFromTarget(button)).toEqual({
      elementId: 'chat.mr_onehook_get_pro',
      action: 'tap',
      value: 'composer',
    });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(openMrOneHookPro).toHaveBeenCalledTimes(1);
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(chatSpy).not.toHaveBeenCalled();
  });
});

describe('"Ask Mr OneHook" for files selected in a match chat', () => {
  it('Pro: chat.select_ask_mr_onehook; Free: chat.mr_onehook_get_pro = ask_from_chat', () => {
    const onClick = vi.fn();
    render(<AskMrOneHookButton plan={MrOneHookPlan.PRO} selectedCount={2} fileCount={2} onClick={onClick} />);
    const ask = screen.getByRole('button', { name: 'Ask Mr OneHook' });
    expect(uiInteractionFromTarget(ask)).toEqual({ elementId: 'chat.select_ask_mr_onehook', action: 'tap' });
    fireEvent.click(ask);
    expect(onClick).toHaveBeenCalledTimes(1);
    cleanup();
    render(<AskMrOneHookButton plan={MrOneHookPlan.FREE} selectedCount={2} fileCount={1} onClick={onClick} />);
    expect(uiInteractionFromTarget(screen.getByRole('button', { name: 'Get Mr OneHook Pro' }))).toEqual({
      elementId: 'chat.mr_onehook_get_pro',
      action: 'tap',
      value: 'ask_from_chat',
    });
  });
});

describe('Mr OneHook Pro entry points report their catalog id', () => {
  const member = { id: '' } as UserProfile;

  it('the Mr OneHook chat header: chat.mr_onehook_get_pro = header (Free and Pro)', () => {
    render(
      <ToastProvider>
        <MrOneHookConversation
          currentUser={member}
          wallpaper={CHAT_WALLPAPERS[0]}
          matches={[]}
          pro={FREE}
          handoff={null}
          onHandoffTaken={() => undefined}
        />
      </ToastProvider>
    );
    const getPro = screen.getByRole('button', { name: 'Get Mr OneHook Pro' });
    expect(uiInteractionFromTarget(getPro)).toEqual({ elementId: 'chat.mr_onehook_get_pro', action: 'tap', value: 'header' });
    fireEvent.click(getPro);
    expect(openMrOneHookPro).toHaveBeenCalledTimes(1);
    cleanup();

    render(
      <ToastProvider>
        <MrOneHookConversation
          currentUser={member}
          wallpaper={CHAT_WALLPAPERS[0]}
          matches={[]}
          pro={PRO}
          handoff={null}
          onHandoffTaken={() => undefined}
        />
      </ToastProvider>
    );
    expect(uiInteractionFromTarget(screen.getByRole('button', { name: 'Mr OneHook Pro' }))).toEqual({
      elementId: 'chat.mr_onehook_get_pro',
      action: 'tap',
      value: 'header',
    });
  });

  it('Settings: "Get / Manage Mr OneHook Pro" reports profile.mr_onehook_pro_open', () => {
    const status = (plan: MrOneHookPlan) => ({
      plan,
      source: plan === MrOneHookPlan.PRO ? 'MEMBERSHIP' : 'NONE',
      canPurchase: plan !== MrOneHookPlan.PRO,
      offers: [],
      limits: plan === MrOneHookPlan.PRO ? proLimits : FREE_PLAN_FALLBACK_LIMITS,
      notices: [],
    });
    useMrOneHookProStore.setState({ status: status(MrOneHookPlan.FREE) as never, availability: 'ready' });
    render(<SettingsView user={member} />);
    const get = screen.getByRole('button', { name: 'Get Mr OneHook Pro' });
    expect(uiInteractionFromTarget(get)).toEqual({ elementId: 'profile.mr_onehook_pro_open', action: 'tap' });
    fireEvent.click(get);
    expect(openMrOneHookPro).toHaveBeenCalledTimes(1);
    cleanup();

    useMrOneHookProStore.setState({ status: status(MrOneHookPlan.PRO) as never, availability: 'ready' });
    render(<SettingsView user={member} />);
    expect(uiInteractionFromTarget(screen.getByRole('button', { name: 'Manage Mr OneHook Pro' }))).toEqual({
      elementId: 'profile.mr_onehook_pro_open',
      action: 'tap',
    });
    useMrOneHookProStore.setState({ status: null, availability: 'unknown' });
  });
});
