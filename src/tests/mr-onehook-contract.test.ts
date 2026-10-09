import { describe, expect, it } from 'vitest';
import {
  buildMemberChatRequestBody,
  isSessionErrorCode,
  MEMBER_CHAT_PATH,
  parseMemberChatResponse,
  PUBLIC_PRODUCT_CHAT_PATH,
} from '../lib/mr-onehook-contract';
import type { SelectedExcerpt } from '../lib/mr-onehook-excerpts';

/**
 * Contract tests for the Mr.OneHook member endpoint. The request builder is also the enforcement
 * point for "never send message IDs/keys" and "product-only can never carry excerpts", so those are
 * asserted here rather than left to the server to reject.
 */

const excerpt: SelectedExcerpt = {
  speaker: 'match',
  sentAt: '2026-10-04T10:00:00.000Z',
  text: 'I would really like to visit Japan.',
};

describe('endpoint paths', () => {
  it('match the OneHook UX Enhancement backend routes', () => {
    expect(PUBLIC_PRODUCT_CHAT_PATH).toBe('/api/public/product-chat');
    expect(MEMBER_CHAT_PATH).toBe('/api/member/product-connection-chat');
  });
});

describe('buildMemberChatRequestBody — product-only', () => {
  it('omits matchId, excerpts and sessionOptions for a plain product question', () => {
    const body = buildMemberChatRequestBody({ message: '  Which features help me connect?  ' });
    expect(body).toEqual({
      message: 'Which features help me connect?',
      contextOptions: { includeProfile: true, includeMessageHistory: true },
    });
    expect('matchId' in body).toBe(false);
    expect('ephemeralMessageContext' in body).toBe(false);
    expect('sessionOptions' in body).toBe(false);
  });

  it('never attaches excerpts without a matchId, even if excerpts are supplied', () => {
    const body = buildMemberChatRequestBody({ message: 'hi', excerpts: [excerpt] });
    expect('ephemeralMessageContext' in body).toBe(false);
  });

  it('throws on an empty message', () => {
    expect(() => buildMemberChatRequestBody({ message: '   ' })).toThrow();
  });
});

describe('buildMemberChatRequestBody — connection + excerpts', () => {
  it('attaches reviewed excerpts for an authorized match', () => {
    const body = buildMemberChatRequestBody({
      message: 'What did they say about travel?',
      matchId: 'match-1',
      excerpts: [excerpt],
      historyTruncated: true,
      userConfirmed: true,
      contextRequestId: '33333333-3333-4333-8333-333333333333',
    });
    expect(body.matchId).toBe('match-1');
    expect(body.contextRequestId).toBe('33333333-3333-4333-8333-333333333333');
    expect(body.ephemeralMessageContext).toEqual({
      excerpts: [excerpt],
      historyTruncated: true,
      userConfirmed: true,
    });
  });

  it('reduces each excerpt to exactly speaker/sentAt/text (strips any extra fields)', () => {
    const dirty = {
      ...excerpt,
      messageId: 'should-not-leak',
      contentKey: 'secret',
      senderId: 'peer-123',
    } as unknown as SelectedExcerpt;
    const body = buildMemberChatRequestBody({
      message: 'q',
      matchId: 'match-1',
      excerpts: [dirty],
      userConfirmed: true,
    });
    const sent = body.ephemeralMessageContext!.excerpts[0];
    expect(Object.keys(sent).sort()).toEqual(['sentAt', 'speaker', 'text']);
    expect(JSON.stringify(body)).not.toContain('should-not-leak');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('suppresses excerpts when message history is disabled', () => {
    const body = buildMemberChatRequestBody({
      message: 'q',
      matchId: 'match-1',
      includeMessageHistory: false,
      excerpts: [excerpt],
      userConfirmed: true,
    });
    expect('ephemeralMessageContext' in body).toBe(false);
    expect(body.contextOptions.includeMessageHistory).toBe(false);
  });
});

describe('buildMemberChatRequestBody — session options', () => {
  it('requests persistence when persist is set', () => {
    const body = buildMemberChatRequestBody({ message: 'q', persist: true });
    expect(body.sessionOptions).toEqual({ persist: true });
  });

  it('always implies persistence when continuing a sessionId', () => {
    const body = buildMemberChatRequestBody({ message: 'q', sessionId: 'abc', persist: false });
    expect(body.sessionOptions).toEqual({ persist: true, sessionId: 'abc' });
  });

  it('omits sessionOptions entirely for a non-persisted request', () => {
    const body = buildMemberChatRequestBody({ message: 'q', persist: false });
    expect('sessionOptions' in body).toBe(false);
  });
});

describe('parseMemberChatResponse', () => {
  it('parses a final answer with contextUsed, requestId and session', () => {
    const result = parseMemberChatResponse({
      reply: 'Here you go.',
      mood: 'Happy',
      contextUsed: {
        profile: true,
        match: true,
        messageHistory: true,
        messageCount: 3,
        chatSession: true,
        sessionMessageCount: 4,
      },
      requestId: 'req-1',
      session: {
        sessionId: 'sess-1',
        updatedAt: '2026-10-04T10:00:00.000Z',
        expiresAt: '2026-11-03T10:00:00.000Z',
        messageCount: 4,
      },
    });
    expect(result.reply).toBe('Here you go.');
    expect(result.mood).toBe('Happy');
    expect(result.needsMoreContext).toBe(false);
    expect(result.contextUsed?.messageCount).toBe(3);
    expect(result.session?.sessionId).toBe('sess-1');
  });

  it('parses a needsMoreContext response with its bounded contextRequest', () => {
    const result = parseMemberChatResponse({
      reply: 'Can you share the travel chat?',
      mood: 'Thinking',
      needsMoreContext: true,
      contextRequest: {
        requestId: 'ctx-1',
        searchTerms: ['travel', 'japan'],
        dateRange: { from: '2026-08-01T00:00:00.000Z', to: '2026-10-04T23:59:59.000Z' },
        maxMessages: 8,
      },
      requestId: 'req-2',
    });
    expect(result.needsMoreContext).toBe(true);
    expect(result.contextRequest).toEqual({
      requestId: 'ctx-1',
      searchTerms: ['travel', 'japan'],
      dateRange: { from: '2026-08-01T00:00:00.000Z', to: '2026-10-04T23:59:59.000Z' },
      maxMessages: 8,
    });
  });

  it('falls back to safe defaults for an invalid mood or non-object body', () => {
    expect(parseMemberChatResponse({ reply: 'x', mood: 'Furious' }).mood).toBe('Neutral');
    expect(parseMemberChatResponse(null)).toEqual({ reply: '', mood: 'Neutral', needsMoreContext: false });
  });
});

describe('isSessionErrorCode', () => {
  it('recognises session-level denial codes', () => {
    expect(isSessionErrorCode('CHAT_SESSION_NOT_INCLUDED_IN_TIER')).toBe(true);
    expect(isSessionErrorCode('CHAT_SESSION_LIMIT_REACHED')).toBe(true);
    expect(isSessionErrorCode('CHAT_SESSION_NOT_FOUND')).toBe(true);
    expect(isSessionErrorCode('AI_RATE_LIMITED')).toBe(false);
    expect(isSessionErrorCode(undefined)).toBe(false);
  });
});
