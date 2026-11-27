import { describe, expect, it } from 'vitest';
import {
  QUICK_REACTIONS,
  MAX_REACTIONS_PER_MEMBER,
  buildReactionChips,
  combineReactionEmojis,
  listReactors,
  normalizeReactionSet,
  normalizeSingleReaction,
  parseReactionEmojis,
  parseReactionsMap,
  reactionIdentity,
  sameReactionEmoji,
  toggleReaction,
} from '../lib/chat-reactions';

describe('chat-reactions unit tests', () => {
  it('treats FE0F variation selectors as the same emoji identity', () => {
    expect(reactionIdentity('❤️')).toBe(reactionIdentity('❤'));
    expect(sameReactionEmoji('❤️', '❤')).toBe(true);
    expect(QUICK_REACTIONS).toHaveLength(6);
  });

  it('validates single pictographic emoji and rejects ASCII or multi-grapheme input', () => {
    expect(normalizeSingleReaction('🔥')).toBe('🔥');
    expect(normalizeSingleReaction('  👍  ')).toBe('👍');
    expect(normalizeSingleReaction('ok')).toBeNull();
    expect(normalizeSingleReaction('')).toBeNull();
    expect(normalizeSingleReaction('😂😭')).toBeNull();
  });

  it('toggles emojis on and off and enforces the per-member maximum', () => {
    let set = toggleReaction(null, '❤️');
    expect(set).toBe('❤️');
    set = toggleReaction(set, '❤');
    expect(set).toBeNull();

    let many: string | null = null;
    for (const emoji of ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥', '✨', '🎉']) {
      many = toggleReaction(many, emoji);
    }
    const parsed = parseReactionEmojis(many);
    expect(parsed).toHaveLength(MAX_REACTIONS_PER_MEMBER);
    expect(combineReactionEmojis(parsed)).toBe(many);
    expect(normalizeReactionSet('❤️😂')).toBe('❤️😂');
  });

  it('parses malformed reactions JSON safely and aggregates chips and reactor entries', () => {
    expect(parseReactionsMap(null)).toEqual({});
    expect(parseReactionsMap('[1,2]')).toEqual({});
    expect(parseReactionsMap('{"u1":"cipher1","u2":42}')).toEqual({ u1: 'cipher1' });

    const byUser = { peer: '❤️😂', u1: '😂' };
    const chips = buildReactionChips(byUser, 'u1');
    expect(chips[0]).toEqual({ emoji: '😂', count: 2, includesMine: true });
    expect(chips[1]).toEqual({ emoji: '❤️', count: 1, includesMine: false });

    const reactors = listReactors(byUser, 'u1');
    expect(reactors[0]).toEqual({ userId: 'u1', emoji: '😂', isMine: true });
    expect(reactors).toHaveLength(3);
  });
});
