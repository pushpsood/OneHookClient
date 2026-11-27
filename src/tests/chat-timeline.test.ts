import { describe, expect, it } from 'vitest';
import {
  DISAPPEARING_PRESETS,
  PartnerRestrictionGate,
  buildChatTranscript,
  computeBubblePositions,
  extractUrls,
  formatDayLabel,
  formatDisappearingLong,
  formatDisappearingShort,
  messagePreviewText,
  sameLocalDay,
  searchConversationMessages,
} from '../lib/chat-timeline';
import type { ChatMessageView } from '../types';

function makeMsg(
  id: string,
  senderId: string,
  timestamp: number,
  ciphertext: string,
  extra: Partial<ChatMessageView> = {}
): ChatMessageView {
  return {
    matchId: 'm1',
    messageId: id,
    senderId,
    timestamp,
    ciphertext,
    status: 'SENT' as ChatMessageView['status'],
    ...extra,
  };
}

describe('chat-timeline unit tests', () => {
  it('groups consecutive sender messages within 2 minutes on the same day', () => {
    const base = new Date(2026, 4, 10, 12, 0, 0).getTime();
    const positions = computeBubblePositions([
      makeMsg('1', 'me', base, 'a'),
      makeMsg('2', 'me', base + 30_000, 'b'),
      makeMsg('3', 'me', base + 60_000, 'c'),
      makeMsg('4', 'peer', base + 90_000, 'd'),
      makeMsg('5', 'me', base + 5 * 60_000, 'e'),
    ]);
    expect(positions.get('1')).toBe('first');
    expect(positions.get('2')).toBe('middle');
    expect(positions.get('3')).toBe('last');
    expect(positions.get('4')).toBe('single');
    expect(positions.get('5')).toBe('single');
  });

  it('formats day divider labels relative to today and checks sameLocalDay', () => {
    const now = new Date(2026, 4, 15, 14, 0, 0).getTime();
    const today = new Date(2026, 4, 15, 0, 0, 0).getTime();
    const yesterday = new Date(2026, 4, 14, 0, 0, 0).getTime();
    expect(sameLocalDay(now, today)).toBe(true);
    expect(sameLocalDay(now, yesterday)).toBe(false);
    expect(formatDayLabel(today, now)).toBe('Today');
    expect(formatDayLabel(yesterday, now)).toBe('Yesterday');
  });

  it('filters search queries across all, sender, links, and skips undecryptable items', () => {
    const t = 1_700_000_000_000;
    const messages = [
      makeMsg('1', 'me', t, 'Visit https://onehook.club for info'),
      makeMsg('2', 'peer', t + 1000, 'Sounds great!'),
      makeMsg('3', 'peer', t + 2000, 'encrypted blob', { undecryptable: true }),
    ];
    expect(extractUrls('See https://onehook.club now')).toEqual(['https://onehook.club']);
    expect(searchConversationMessages(messages, '', 'links')).toEqual(['1']);
    expect(searchConversationMessages(messages, 'sounds', 'from_them')).toEqual(['2']);
    expect(searchConversationMessages(messages, 'encrypted', 'all')).toEqual([]);
    expect(messagePreviewText(messages[2])).toBe('Locked message');
  });

  it('formats disappearing presets and enforces PartnerRestrictionGate & transcript export', () => {
    expect(DISAPPEARING_PRESETS.map((p) => p.seconds)).toEqual([0, 86_400, 7 * 86_400, 90 * 86_400]);
    expect(formatDisappearingShort(3600)).toBe('1h');
    expect(formatDisappearingLong(86_400 * 7)).toBe('7 days');

    const strict = { saveMedia: true, export: true, mrOneHook: true };
    expect(PartnerRestrictionGate.canSaveMedia(false, strict)).toBe(false);
    expect(PartnerRestrictionGate.canSaveMedia(true, strict)).toBe(true);
    expect(PartnerRestrictionGate.canExportChat(strict)).toBe(false);
    expect(
      PartnerRestrictionGate.shareableWithMrOneHook(
        [{ senderId: 'me' }, { senderId: 'peer' }],
        strict
      )
    ).toEqual([{ senderId: 'me' }]);

    const transcript = buildChatTranscript(
      [
        makeMsg('1', 'me', 1_700_000_000_000, 'Hello there'),
        makeMsg('2', 'peer', 1_700_000_001_000, 'Hidden', { undecryptable: true }),
      ],
      'Riya'
    );
    expect(transcript).toContain('You: Hello there');
    expect(transcript).not.toContain('Hidden');
  });
});
