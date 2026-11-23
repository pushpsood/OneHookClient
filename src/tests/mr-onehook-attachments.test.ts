import { describe, expect, it } from 'vitest';
import type { ChatAttachment } from 'onehook-mr-onehook-client';
import {
  ATTACHMENT_POLL_INTERVAL_MS,
  composerAction,
  createPollGate,
  encodeAttachmentName,
  readyAttachmentIds,
  rejectionCopy,
  runAttachment,
  selectAttachments,
  type AttachmentCallResult,
  type AttachmentDeps,
  type PendingAttachment,
} from '../lib/mr-onehook-attachments';

/**
 * The Mr OneHook Pro attachment flow: select (client-side checks) -> upload -> poll -> send, and the
 * Free vs Pro gating of the send / "Ask Mr OneHook" buttons.
 */

const MB = 1024 * 1024;
const limits = { maxAttachmentBytes: 5 * MB, maxAttachmentsPerMessage: 3 };
const file = (name: string, size = 10, type = 'image/png') => ({
  name,
  size,
  type,
  blob: new Blob([new Uint8Array(size)]),
});

const attachment = (over: Partial<ChatAttachment> = {}): ChatAttachment => ({
  attachmentId: 'a1',
  name: 'photo.png',
  kind: 'image',
  mediaType: 'image/png',
  sizeBytes: 10,
  status: 'PROCESSING',
  source: 'upload',
  createdAt: '2026-11-01T00:00:00Z',
  expiresAt: '2026-11-02T00:00:00Z',
  ...over,
});

/** Fake SDK: scripted answers, a virtual clock, and a log of every call. */
function fakeDeps(script: {
  upload?: AttachmentCallResult | Error;
  polls?: Array<AttachmentCallResult | Error>;
}) {
  const calls: string[] = [];
  const uploads: Array<Parameters<AttachmentDeps['upload']>[0]> = [];
  const sleeps: number[] = [];
  let clock = 0;
  const polls = [...(script.polls ?? [])];
  const deps: AttachmentDeps = {
    upload: async (input) => {
      calls.push('upload');
      uploads.push(input);
      const r = script.upload ?? { ok: true, attachment: attachment() };
      if (r instanceof Error) throw r;
      return r;
    },
    get: async (id) => {
      calls.push(`get:${id}`);
      const r = polls.shift() ?? { ok: true, attachment: attachment({ status: 'READY' }) };
      if (r instanceof Error) throw r;
      return r;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
  };
  return { deps, calls, uploads, sleeps };
}

const selected = (): PendingAttachment =>
  selectAttachments([], [file('photo.png')], limits).items[0];

describe('selecting files (client-side checks before any upload)', () => {
  it('accepts up to 3 files and rejects anything over 5 MB', () => {
    const { items, rejected } = selectAttachments(
      [],
      [file('a'), file('big', 6 * MB), file('b'), file('c'), file('d')],
      limits
    );
    expect(items.map((i) => i.name)).toEqual(['a', 'b', 'c']);
    expect(items.every((i) => i.status === 'selected')).toBe(true);
    expect(rejected).toEqual([
      { name: 'big', reason: 'TOO_LARGE' },
      { name: 'd', reason: 'TOO_MANY' },
    ]);
    expect(rejectionCopy(rejected, limits)).toBe('big is over 5 MB. You can add up to 3 files.');
  });

  it('a file of exactly the limit is accepted', () => {
    expect(selectAttachments([], [file('edge', 5 * MB)], limits).items).toHaveLength(1);
  });

  it('percent-encodes the file name for X-Attachment-Name', () => {
    expect(encodeAttachmentName('résumé 2026.pdf')).toBe('r%C3%A9sum%C3%A9%202026.pdf');
    expect(decodeURIComponent(encodeAttachmentName('x'.repeat(300)))).toHaveLength(255);
  });
});

describe('Free vs Pro gating of the send button', () => {
  it('Free with files: the button reads "Get Mr OneHook Pro"', () => {
    const items = selectAttachments([], [file('a')], limits).items;
    expect(composerAction('FREE', items, 'what is this?')).toBe('GET_PRO');
    expect(composerAction('FREE', items, '')).toBe('GET_PRO');
  });

  it('Free without files sends as usual', () => {
    expect(composerAction('FREE', [], 'hi')).toBe('SEND');
    expect(composerAction('FREE', [], '  ')).toBe('DISABLED');
  });

  it('Pro waits for every file to be READY, and a failed file must be removed first', () => {
    const base = selected();
    expect(composerAction('PRO', [{ ...base, status: 'uploading' }], 'hi')).toBe('WAIT');
    expect(
      composerAction('PRO', [{ ...base, status: 'processing', attachmentId: 'a1' }], 'hi')
    ).toBe('WAIT');
    expect(composerAction('PRO', [{ ...base, status: 'failed' }], 'hi')).toBe('FIX');
    const ready = [{ ...base, status: 'ready' as const, attachmentId: 'a1' }];
    expect(composerAction('PRO', ready, 'hi')).toBe('SEND');
    expect(composerAction('PRO', ready, '')).toBe('DISABLED');
    expect(readyAttachmentIds(ready)).toEqual(['a1']);
  });
});

describe('the attachment flow: upload -> poll -> READY / FAILED', () => {
  it('uploads the raw bytes, then polls every 1.5 s until READY', async () => {
    const { deps, calls, uploads, sleeps } = fakeDeps({
      polls: [
        { ok: true, attachment: attachment() },
        { ok: true, attachment: attachment({ status: 'READY' }) },
      ],
    });
    const states: string[] = [];
    const final = await runAttachment(selected(), deps, (i) => states.push(i.status));
    expect(states).toEqual(['uploading', 'processing', 'processing', 'ready']);
    expect(final).toMatchObject({ status: 'ready', attachmentId: 'a1', kind: 'image' });
    expect(calls).toEqual(['upload', 'get:a1', 'get:a1']);
    expect(uploads[0]).toMatchObject({ contentType: 'image/png', fileName: 'photo.png' });
    expect(uploads[0].body).toBeInstanceOf(Uint8Array);
    expect(uploads[0]).not.toHaveProperty('matchId');
    expect(sleeps).toEqual([ATTACHMENT_POLL_INTERVAL_MS, ATTACHMENT_POLL_INTERVAL_MS]);
  });

  it('a file from a match chat carries matchId and sender', async () => {
    const { deps, uploads } = fakeDeps({});
    const item = selectAttachments([], [file('p.jpg')], limits, { matchId: 'm1', sender: 'match' })
      .items[0];
    await runAttachment(item, deps, () => undefined);
    expect(uploads[0]).toMatchObject({ matchId: 'm1', sender: 'match' });
  });

  it('a FAILED status ends with its reason', async () => {
    const { deps } = fakeDeps({
      polls: [
        { ok: true, attachment: attachment({ status: 'FAILED', failureReason: 'UNREADABLE' }) },
      ],
    });
    expect(await runAttachment(selected(), deps, () => undefined)).toMatchObject({
      status: 'failed',
      failureReason: 'UNREADABLE',
    });
  });

  it('upload refusals: 415, 413, 429 with retryAt, 403 PRO_REQUIRED', async () => {
    const cases: Array<[number, Record<string, unknown>, Record<string, unknown>]> = [
      [415, { error: 'UNSUPPORTED_ATTACHMENT_TYPE' }, { kind: 'UNSUPPORTED_TYPE' }],
      [413, { error: 'ATTACHMENT_TOO_LARGE' }, { kind: 'TOO_LARGE' }],
      [
        429,
        { error: 'ATTACHMENT_PROCESSING_UNAVAILABLE', retryAt: 'R' },
        { kind: 'PROCESSING_UNAVAILABLE', retryAt: 'R' },
      ],
      [403, { error: 'PRO_REQUIRED' }, { kind: 'PRO_REQUIRED' }],
    ];
    for (const [status, body, problem] of cases) {
      const { deps, calls } = fakeDeps({ upload: { ok: false, status, body } });
      const final = await runAttachment(selected(), deps, () => undefined);
      expect(final.status).toBe('failed');
      expect(final.problem).toEqual(problem);
      expect(calls).toEqual(['upload']);
    }
  });

  it('a 429 or 409 ATTACHMENT_NOT_READY while polling backs off and keeps polling', async () => {
    const { deps, calls } = fakeDeps({
      polls: [
        { ok: false, status: 429, body: { error: 'RATE_LIMITED' } },
        { ok: false, status: 409, body: { error: 'ATTACHMENT_NOT_READY' } },
        { ok: true, attachment: attachment({ status: 'READY' }) },
      ],
    });
    expect((await runAttachment(selected(), deps, () => undefined)).status).toBe('ready');
    expect(calls.filter((c) => c.startsWith('get'))).toHaveLength(3);
  });

  it('a 404 while polling (expired) fails; a network blip is retried', async () => {
    const gone = fakeDeps({
      polls: [{ ok: false, status: 404, body: { error: 'ATTACHMENT_NOT_FOUND' } }],
    });
    expect((await runAttachment(selected(), gone.deps, () => undefined)).problem).toEqual({
      kind: 'NOT_FOUND',
    });
    const blip = fakeDeps({
      polls: [new Error('offline'), { ok: true, attachment: attachment({ status: 'READY' }) }],
    });
    expect((await runAttachment(selected(), blip.deps, () => undefined)).status).toBe('ready');
  });

  it('gives up polling after the timeout', async () => {
    const { deps } = fakeDeps({
      polls: Array.from(
        { length: 1000 },
        () => ({ ok: true, attachment: attachment() }) as AttachmentCallResult
      ),
    });
    const final = await runAttachment(selected(), deps, () => undefined);
    expect(final).toMatchObject({ status: 'failed', problem: { kind: 'UNAVAILABLE' } });
  });

  it('an already uploaded file (Ask Mr OneHook) is only polled', async () => {
    const { deps, calls } = fakeDeps({});
    const handed: PendingAttachment = {
      ...selected(),
      blob: undefined,
      attachmentId: 'a9',
      status: 'processing',
    };
    expect((await runAttachment(handed, deps, () => undefined)).status).toBe('ready');
    expect(calls).toEqual(['get:a9']);
  });

  it('a removed chip stops reporting', async () => {
    let cancelled = false;
    const { deps } = fakeDeps({ polls: [{ ok: true, attachment: attachment() }] });
    const states: string[] = [];
    const run = runAttachment(selected(), { ...deps, cancelled: () => cancelled }, (i) => {
      states.push(i.status);
      if (i.status === 'processing') cancelled = true;
    });
    await run;
    expect(states).toEqual(['uploading', 'processing']);
  });
});

describe('Ask Mr OneHook from a match chat', () => {
  it('uploads each decrypted file with matchId and sender, and hands over the ids', async () => {
    const { uploadMatchChatAttachments } = await import('../lib/mr-onehook');
    const { deps, uploads } = fakeDeps({
      upload: { ok: true, attachment: attachment({ attachmentId: 'x1', source: 'match_chat' }) },
    });
    const result = await uploadMatchChatAttachments(
      [
        { ...file('mine.jpg'), origin: { matchId: 'm1', sender: 'self' } },
        {
          ...file('theirs.pdf', 10, 'application/pdf'),
          origin: { matchId: 'm1', sender: 'match' },
        },
      ],
      deps
    );
    expect(result.ok).toBe(true);
    expect(uploads.map((u) => [u.matchId, u.sender, u.contentType])).toEqual([
      ['m1', 'self', 'image/png'],
      ['m1', 'match', 'application/pdf'],
    ]);
    if (result.ok === true) {
      expect(result.items.map((i) => [i.attachmentId, i.status, i.origin?.sender])).toEqual([
        ['x1', 'processing', 'self'],
        ['x1', 'processing', 'match'],
      ]);
      expect(result.items.every((i) => i.blob === undefined)).toBe(true);
    }
  });

  it('403 MESSAGE_CONTEXT_NOT_ALLOWED: the match does not allow its history to be used', async () => {
    const { uploadMatchChatAttachments } = await import('../lib/mr-onehook');
    const { deps } = fakeDeps({
      upload: { ok: false, status: 403, body: { error: 'MESSAGE_CONTEXT_NOT_ALLOWED' } },
    });
    const result = await uploadMatchChatAttachments(
      [{ ...file('theirs.jpg'), origin: { matchId: 'm1', sender: 'match' } }],
      deps
    );
    expect(result).toEqual({ ok: false, problem: { kind: 'MESSAGE_CONTEXT_NOT_ALLOWED' } });
  });
});

describe('polling budget (GetChatAttachment: 60 a minute, shared by every file)', () => {
  it('spaces polls from concurrent files at least 1 s apart', async () => {
    let clock = 0;
    const at: number[] = [];
    const gate = createPollGate(
      1000,
      () => clock,
      async (ms) => {
        clock += ms;
      }
    );
    for (let i = 0; i < 4; i += 1) {
      await gate();
      at.push(clock);
    }
    expect(at).toEqual([0, 1000, 2000, 3000]);
    clock = 10_000;
    await gate();
    expect(clock).toBe(10_000);
  });
});
