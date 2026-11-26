/**
 * "Ask Mr OneHook about messages and files": the pure rules (lib/mr-onehook-ask.ts) for what can be
 * selected, the limits (30 messages, 12,000 characters, files), what is sent, and the per-match record
 * of a refused history.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASK_FILE_TOO_LARGE_COPY,
  DEFAULT_ASK_LIMITS,
  askCandidate,
  askCandidates,
  askCharacterLimitCopy,
  askConfirmTitle,
  askCountPhrase,
  askFileLimitCopy,
  askMessageLimitCopy,
  askSelectionTotals,
  buildAskShare,
  isMessageHistoryNotAllowed,
  noteMessageHistoryNotAllowed,
  resetMessageHistoryPolicy,
  toggleAskSelection,
  type AskLimits,
  type AskMessageView,
} from '../lib/mr-onehook-ask';
import { frameAttachment, type AttachmentEnvelope } from '../lib/chat-attachments';
import { frameStructuredContent } from '../lib/chat-structured';

const MiB = 1024 * 1024;
const T0 = Date.UTC(2026, 10, 1, 9, 0, 0);
const LIMITS: AskLimits = { ...DEFAULT_ASK_LIMITS, maxFiles: 3, maxFileBytes: 5 * MiB };
const OPTS = { historyAllowed: true, filesAllowed: true, limits: LIMITS };

const envelope = (over: Partial<AttachmentEnvelope> = {}): AttachmentEnvelope => ({
  v: 1,
  kind: 'file',
  objectKey: 'm1/obj',
  contentKey: 'a2V5',
  nonce: 'bm9uY2U=',
  mime: 'application/pdf',
  name: 'ticket.pdf',
  size: 1000,
  ...over,
});

let n = 0;
const msg = (over: Partial<AskMessageView> = {}): AskMessageView => {
  n += 1;
  return { messageId: `m${n}`, senderId: 'me', ciphertext: `hello ${n}`, timestamp: T0 + n * 60_000, status: 'SENT', ...over };
};

afterEach(() => resetMessageHistoryPolicy());

describe('what can be selected', () => {
  it('a readable text message, as self or match, trimmed', () => {
    expect(askCandidate(msg({ messageId: 'a', ciphertext: '  see you at 7  ', timestamp: T0 }), OPTS)).toEqual({
      messageId: 'a',
      speaker: 'self',
      timestamp: T0,
      text: 'see you at 7',
    });
    expect(askCandidate(msg({ senderId: 'peer-1' }), OPTS)?.speaker).toBe('match');
  });

  it('never: undecryptable, failed or sending, empty, the "[Unable to decrypt]" placeholder, a location or contact card', () => {
    expect(askCandidate(msg({ undecryptable: true, ciphertext: '' }), OPTS)).toBeNull();
    expect(askCandidate(msg({ status: 'FAILED' }), OPTS)).toBeNull();
    expect(askCandidate(msg({ status: 'SENDING' }), OPTS)).toBeNull();
    expect(askCandidate(msg({ ciphertext: '   ' }), OPTS)).toBeNull();
    expect(askCandidate(msg({ ciphertext: '[Unable to decrypt]' }), OPTS)).toBeNull();
    expect(askCandidate(msg({ ciphertext: frameStructuredContent({ v: 1, type: 'location', lat: 1, lon: 2 }) }), OPTS)).toBeNull();
    expect(askCandidate(msg({ ciphertext: frameStructuredContent({ v: 1, type: 'contact', displayName: 'X' }) }), OPTS)).toBeNull();
    // An attachment this build cannot read.
    expect(askCandidate(msg({ ciphertext: '\u0001{not json' }), OPTS)).toBeNull();
  });

  it('a photo or file is a file when files are allowed; its caption is text', () => {
    const file = askCandidate(msg({ ciphertext: frameAttachment(envelope()) }), OPTS);
    expect(file?.file?.name).toBe('ticket.pdf');
    expect(file?.text).toBeUndefined();
    const captioned = askCandidate(msg({ ciphertext: frameAttachment(envelope({ kind: 'image', caption: ' our table ' })) }), OPTS);
    expect(captioned?.text).toBe('our table');
    expect(captioned?.file).toBeDefined();
    // Files off (Pro not available here): a file without a caption cannot be selected.
    expect(askCandidate(msg({ ciphertext: frameAttachment(envelope()) }), { ...OPTS, filesAllowed: false })).toBeNull();
    const captionOnly = askCandidate(msg({ ciphertext: frameAttachment(envelope({ caption: 'menu' })) }), {
      ...OPTS,
      filesAllowed: false,
    });
    expect(captionOnly?.text).toBe('menu');
    expect(captionOnly && 'file' in captionOnly).toBe(false);
  });

  it('a file over 5 MB is shown as selectable but refused with a notice', () => {
    const big = askCandidate(msg({ messageId: 'big', ciphertext: frameAttachment(envelope({ size: 5 * MiB + 1 })) }), OPTS)!;
    expect(big.file).toBeUndefined();
    expect(big.oversizedFile).toBeDefined();
    const result = toggleAskSelection([], 'big', new Map([['big', big]]), LIMITS);
    expect(result).toEqual({ outcome: 'refused', selected: [], notice: ASK_FILE_TOO_LARGE_COPY });
  });

  it('history not allowed: no text (messages or captions) can be selected; files still can', () => {
    const opts = { ...OPTS, historyAllowed: false };
    expect(askCandidate(msg(), opts)).toBeNull();
    const captioned = askCandidate(msg({ ciphertext: frameAttachment(envelope({ caption: 'our table' })) }), opts);
    expect(captioned?.text).toBeUndefined();
    expect(captioned?.file).toBeDefined();
  });

  it('a message over 4,000 characters is shortened, and marked so', () => {
    const c = askCandidate(msg({ ciphertext: 'x'.repeat(4500) }), OPTS)!;
    expect(c.text).toHaveLength(4000);
    expect(c.shortened).toBe(true);
  });

  it('askCandidates keeps only the selectable messages, by id', () => {
    const map = askCandidates([msg({ messageId: 'ok' }), msg({ messageId: 'bad', status: 'FAILED' })], OPTS);
    expect([...map.keys()]).toEqual(['ok']);
  });
});

describe('the limits', () => {
  it('30 messages at a time', () => {
    const views = Array.from({ length: 31 }, (_, i) => msg({ messageId: `t${i}`, ciphertext: `m${i}` }));
    const map = askCandidates(views, OPTS);
    let selected: string[] = [];
    for (let i = 0; i < 30; i++) selected = toggleAskSelection(selected, `t${i}`, map, LIMITS).selected;
    expect(selected).toHaveLength(30);
    expect(toggleAskSelection(selected, 't30', map, LIMITS)).toEqual({
      outcome: 'refused',
      selected,
      notice: askMessageLimitCopy(30),
    });
    expect(askMessageLimitCopy(30)).toBe('You can share up to 30 messages at a time.');
  });

  it('12,000 characters in all', () => {
    const views = [0, 1, 2, 3].map((i) => msg({ messageId: `c${i}`, ciphertext: String(i).repeat(4000) }));
    const map = askCandidates(views, OPTS);
    let selected: string[] = [];
    for (const id of ['c0', 'c1', 'c2']) selected = toggleAskSelection(selected, id, map, LIMITS).selected;
    expect(askSelectionTotals(selected, map)).toEqual({ messages: 3, files: 0, characters: 12000 });
    const refused = toggleAskSelection(selected, 'c3', map, LIMITS);
    expect(refused).toEqual({ outcome: 'refused', selected, notice: askCharacterLimitCopy(12000) });
    expect(askCharacterLimitCopy(12000)).toBe(
      'Mr OneHook can read up to 12,000 characters of messages at a time. Deselect a message to add this one.'
    );
    // Deselecting always works and makes room again.
    const fewer = toggleAskSelection(selected, 'c0', map, LIMITS);
    expect(fewer).toEqual({ outcome: 'deselected', selected: ['c1', 'c2'] });
    expect(toggleAskSelection(fewer.selected, 'c3', map, LIMITS).outcome).toBe('selected');
  });

  it('up to maxFiles files; files do not count against the message limits', () => {
    const views = [0, 1, 2, 3].map((i) =>
      msg({ messageId: `f${i}`, ciphertext: frameAttachment(envelope({ name: `f${i}.pdf`, objectKey: `m1/${i}` })) })
    );
    const map = askCandidates(views, OPTS);
    let selected: string[] = [];
    for (const id of ['f0', 'f1', 'f2']) selected = toggleAskSelection(selected, id, map, LIMITS).selected;
    expect(askSelectionTotals(selected, map)).toEqual({ messages: 0, files: 3, characters: 0 });
    expect(toggleAskSelection(selected, 'f3', map, LIMITS)).toEqual({
      outcome: 'refused',
      selected,
      notice: askFileLimitCopy(3),
    });
  });
});

describe('what is sent', () => {
  it('excerpts are oldest first with exactly speaker, sentAt (ISO-8601) and text; files with their sender', () => {
    const later = msg({ messageId: 'later', senderId: 'peer-1', ciphertext: 'Dinner at 8?', timestamp: T0 + 120_000 });
    const earlier = msg({ messageId: 'earlier', ciphertext: 'Hi!', timestamp: T0 });
    const file = msg({ messageId: 'file', senderId: 'peer-1', ciphertext: frameAttachment(envelope()), timestamp: T0 + 60_000 });
    const map = askCandidates([earlier, file, later], OPTS);
    const share = buildAskShare(['later', 'file', 'earlier'], map);
    expect(share.excerpts).toEqual([
      { speaker: 'self', sentAt: new Date(T0).toISOString(), text: 'Hi!' },
      { speaker: 'match', sentAt: new Date(T0 + 120_000).toISOString(), text: 'Dinner at 8?' },
    ]);
    for (const e of share.excerpts) expect(Object.keys(e).sort()).toEqual(['sentAt', 'speaker', 'text']);
    expect(share.files).toEqual([
      { messageId: 'file', envelope: envelope(), sender: 'match', timestamp: T0 + 60_000 },
    ]);
    expect(share.shortened).toEqual([]);
  });

  it('records which excerpts were shortened', () => {
    const map = askCandidates([msg({ messageId: 'long', ciphertext: 'y'.repeat(5000) })], OPTS);
    expect(buildAskShare(['long'], map).shortened).toEqual([0]);
  });

  it('titles and count phrases', () => {
    const e = { speaker: 'self' as const, sentAt: new Date(T0).toISOString(), text: 'x' };
    const f = { messageId: 'f', envelope: envelope(), sender: 'self' as const, timestamp: T0 };
    expect(askConfirmTitle({ excerpts: [e], files: [] })).toBe('Ask Mr OneHook about this message?');
    expect(askConfirmTitle({ excerpts: [e, e], files: [] })).toBe('Ask Mr OneHook about these 2 messages?');
    expect(askConfirmTitle({ excerpts: [], files: [f] })).toBe('Ask Mr OneHook about this file?');
    expect(askConfirmTitle({ excerpts: [e, e], files: [f] })).toBe('Ask Mr OneHook about these 2 messages and 1 file?');
    expect(askCountPhrase(0, 2)).toBe('2 files');
    expect(askCountPhrase(1, 0)).toBe('1 message');
  });
});

describe('matches whose history may not be used', () => {
  it('a refusal is remembered per match, for this page', () => {
    expect(isMessageHistoryNotAllowed('m1')).toBe(false);
    noteMessageHistoryNotAllowed('m1');
    noteMessageHistoryNotAllowed(undefined);
    expect(isMessageHistoryNotAllowed('m1')).toBe(true);
    expect(isMessageHistoryNotAllowed('m2')).toBe(false);
  });
});
