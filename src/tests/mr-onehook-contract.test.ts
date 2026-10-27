import { describe, expect, it } from 'vitest';
import {
  buildMemberChatRequestBody,
  classifyMemberChatAvailability,
  isSessionErrorCode,
  MEMBER_CHAT_PATH,
  parseMemberChatResponse,
  matchSuggestionNote,
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

describe('classifyMemberChatAvailability — entitlement/auth gating', () => {
  it('classifies 403 INSUFFICIENT_PERMISSION as NOT_ENTITLED', () => {
    expect(classifyMemberChatAvailability(403, 'INSUFFICIENT_PERMISSION')).toBe('NOT_ENTITLED');
    // Status alone is enough even if the code is absent/changed.
    expect(classifyMemberChatAvailability(403, undefined)).toBe('NOT_ENTITLED');
  });

  it('classifies 401 auth codes as NOT_AUTHENTICATED', () => {
    expect(classifyMemberChatAvailability(401, 'AUTH_REQUIRED')).toBe('NOT_AUTHENTICATED');
    expect(classifyMemberChatAvailability(401, 'INVALID_ACCESS_TOKEN')).toBe('NOT_AUTHENTICATED');
  });

  it('classifies 404/503 config outcomes as NOT_CONFIGURED', () => {
    expect(classifyMemberChatAvailability(404, 'ENDPOINT_NOT_FOUND')).toBe('NOT_CONFIGURED');
    expect(classifyMemberChatAvailability(503, 'CONTEXT_NOT_CONFIGURED')).toBe('NOT_CONFIGURED');
  });

  it('returns undefined for transient/server errors (retryable, not terminal)', () => {
    expect(classifyMemberChatAvailability(500, undefined)).toBeUndefined();
    expect(classifyMemberChatAvailability(429, 'RATE_LIMITED')).toBeUndefined();
    // A plain 503 with a session-storage code is transient (handled by session retry), NOT a terminal
    // availability outcome — only the explicit CONTEXT_NOT_CONFIGURED code maps a 503 to NOT_CONFIGURED.
    expect(
      classifyMemberChatAvailability(503, 'CHAT_SESSION_STORAGE_TEMPORARILY_UNAVAILABLE'),
    ).toBeUndefined();
    // A recognised-but-unrelated 403 (a per-request validation failure) must NOT gate the feature.
    expect(classifyMemberChatAvailability(403, 'MESSAGE_CONTEXT_NOT_ALLOWED')).toBeUndefined();
    expect(classifyMemberChatAvailability(403, 'CHAT_SESSION_NOT_INCLUDED_IN_TIER')).toBeUndefined();
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

describe('matchSuggestion — "find me ..." outcome', () => {
  it('parses a valid suggestion outcome and ignores unknown statuses', () => {
    const ok = parseMemberChatResponse({
      reply: 'On it.', mood: 'Happy', matchSuggestion: { status: 'RECORDED', reasoning: 'You asked for a reader' },
    });
    expect(ok.matchSuggestion).toEqual({ status: 'RECORDED', reasoning: 'You asked for a reader' });
    expect(parseMemberChatResponse({ reply: 'x', mood: 'Happy', matchSuggestion: { status: 'NOPE' } }).matchSuggestion)
      .toBeUndefined();
    expect(parseMemberChatResponse({ reply: 'x', mood: 'Happy' }).matchSuggestion).toBeUndefined();
  });

  it('renders a note for each outcome', () => {
    expect(matchSuggestionNote({ status: 'RECORDED', reasoning: 'You asked for a reader' }))
      .toBe('Added to your Discover feed: You asked for a reader');
    expect(matchSuggestionNote({ status: 'PREMIUM_REQUIRED', reasoning: '' })).toMatch(/Upgrade to Super/);
    expect(matchSuggestionNote({ status: 'UNAVAILABLE', reasoning: '' })).toMatch(/try again later/);
  });
});
