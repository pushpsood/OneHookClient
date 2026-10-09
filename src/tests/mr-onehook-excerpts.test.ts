import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXCERPT_BOUNDS,
  selectEphemeralExcerpts,
  toSelectableMessages,
  type SelectableMessage,
} from '../lib/mr-onehook-excerpts';

/**
 * The excerpt selector is the single gate that decides what locally-decrypted match history leaves
 * the device. These tests pin the privacy-critical behaviour: exclusion rules, hard bounds, and that
 * only speaker/sentAt/text ever appear on an excerpt.
 */

const BASE = Date.parse('2026-10-01T00:00:00.000Z');
const minutes = (n: number) => BASE + n * 60_000;

function msg(overrides: Partial<SelectableMessage> & { text: string; timestamp: number }): SelectableMessage {
  return { speaker: 'match', status: 'SENT', ...overrides };
}

describe('selectEphemeralExcerpts — eligibility', () => {
  it('excludes undecryptable, attachment, empty, and failed/sending turns', () => {
    const attachmentFrame = `${String.fromCharCode(1)}{"v":1,"kind":"image"}`;
    const messages: SelectableMessage[] = [
      msg({ text: 'readable one', timestamp: minutes(1) }),
      msg({ text: '', timestamp: minutes(2) }),
      msg({ text: '   ', timestamp: minutes(3) }),
      msg({ text: 'cannot read', timestamp: minutes(4), undecryptable: true }),
      msg({ text: attachmentFrame, timestamp: minutes(5) }),
      msg({ text: 'failed send', timestamp: minutes(6), status: 'FAILED' }),
      msg({ text: 'still sending', timestamp: minutes(7), status: 'SENDING' }),
      msg({ text: 'readable two', timestamp: minutes(8) }),
    ];

    const result = selectEphemeralExcerpts(messages, { maxMessages: 30 });

    expect(result.excerpts.map((e) => e.text)).toEqual(['readable one', 'readable two']);
    expect(result.historyTruncated).toBe(false);
  });

  it('emits ONLY speaker, sentAt and text — never ids/status/keys', () => {
    const result = selectEphemeralExcerpts(
      [msg({ speaker: 'self', text: 'hello there', timestamp: minutes(1), status: 'READ' })],
      { maxMessages: 30 },
    );
    expect(result.excerpts).toHaveLength(1);
    expect(Object.keys(result.excerpts[0]).sort()).toEqual(['sentAt', 'speaker', 'text']);
    expect(result.excerpts[0]).toEqual({
      speaker: 'self',
      sentAt: new Date(minutes(1)).toISOString(),
      text: 'hello there',
    });
  });
});

describe('selectEphemeralExcerpts — bounds', () => {
  it('caps the excerpt count at the requested maximum', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg({ text: `message ${i}`, timestamp: minutes(i) }),
    );
    const result = selectEphemeralExcerpts(messages, { maxMessages: 3 });
    expect(result.excerpts).toHaveLength(3);
    expect(result.historyTruncated).toBe(true);
  });

  it('never exceeds the absolute count bound even if the request asks for more', () => {
    const messages = Array.from({ length: 40 }, (_, i) =>
      msg({ text: `m${i}`, timestamp: minutes(i) }),
    );
    const result = selectEphemeralExcerpts(messages, { maxMessages: 1000 });
    expect(result.excerpts.length).toBeLessThanOrEqual(DEFAULT_EXCERPT_BOUNDS.maxMessages);
  });

  it('clamps an over-long body to the per-message character bound', () => {
    const long = 'x'.repeat(DEFAULT_EXCERPT_BOUNDS.maxMessageCharacters + 500);
    const result = selectEphemeralExcerpts([msg({ text: long, timestamp: minutes(1) })], {
      maxMessages: 30,
    });
    expect(result.excerpts[0].text).toHaveLength(DEFAULT_EXCERPT_BOUNDS.maxMessageCharacters);
  });

  it('respects the total-character budget', () => {
    const chunk = 'y'.repeat(1000);
    const messages = Array.from({ length: 20 }, (_, i) =>
      msg({ text: chunk, timestamp: minutes(i) }),
    );
    const result = selectEphemeralExcerpts(messages, { maxMessages: 30 }, {
      maxMessages: 30,
      maxTotalCharacters: 3500,
      maxMessageCharacters: 4000,
    });
    const total = result.excerpts.reduce((sum, e) => sum + e.text.length, 0);
    expect(total).toBeLessThanOrEqual(3500);
    expect(result.excerpts.length).toBe(3);
  });
});

describe('selectEphemeralExcerpts — relevance, dates, ordering', () => {
  it('prioritises turns matching the search terms, output stays chronological', () => {
    const messages: SelectableMessage[] = [
      msg({ text: 'we talked about the weather', timestamp: minutes(1) }),
      msg({ text: 'I would love to visit Japan someday', timestamp: minutes(2) }),
      msg({ text: 'what did you have for lunch', timestamp: minutes(3) }),
      msg({ text: 'Japan has amazing trains', timestamp: minutes(4) }),
    ];
    const result = selectEphemeralExcerpts(messages, { searchTerms: ['japan'], maxMessages: 2 });
    expect(result.excerpts.map((e) => e.text)).toEqual([
      'I would love to visit Japan someday',
      'Japan has amazing trains',
    ]);
  });

  it('falls back to most recent turns when nothing matches', () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      msg({ text: `turn ${i}`, timestamp: minutes(i) }),
    );
    const result = selectEphemeralExcerpts(messages, { searchTerms: ['nope'], maxMessages: 2 });
    expect(result.excerpts.map((e) => e.text)).toEqual(['turn 3', 'turn 4']);
  });

  it('filters by inclusive date range', () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      msg({ text: `d${i}`, timestamp: minutes(i) }),
    );
    const result = selectEphemeralExcerpts(messages, {
      maxMessages: 30,
      dateRange: { from: minutes(1), to: minutes(3) },
    });
    expect(result.excerpts.map((e) => e.text)).toEqual(['d1', 'd2', 'd3']);
  });

  it('reports historyTruncated=false only when every eligible turn is included', () => {
    const messages = [
      msg({ text: 'a', timestamp: minutes(1) }),
      msg({ text: 'b', timestamp: minutes(2) }),
    ];
    expect(selectEphemeralExcerpts(messages, { maxMessages: 30 }).historyTruncated).toBe(false);
    expect(selectEphemeralExcerpts(messages, { maxMessages: 1 }).historyTruncated).toBe(true);
  });
});

describe('toSelectableMessages', () => {
  it("maps the signed-in user's 'me' sender to self and others to match", () => {
    const result = toSelectableMessages([
      { senderId: 'me', ciphertext: 'mine', timestamp: minutes(1), status: 'SENT' },
      { senderId: 'peer-123', ciphertext: 'theirs', timestamp: minutes(2), status: 'READ' },
      { senderId: 'peer-123', ciphertext: '', timestamp: minutes(3), undecryptable: true },
    ]);
    expect(result).toEqual([
      { speaker: 'self', text: 'mine', timestamp: minutes(1), status: 'SENT', undecryptable: undefined },
      { speaker: 'match', text: 'theirs', timestamp: minutes(2), status: 'READ', undecryptable: undefined },
      { speaker: 'match', text: '', timestamp: minutes(3), status: undefined, undecryptable: true },
    ]);
  });
});
