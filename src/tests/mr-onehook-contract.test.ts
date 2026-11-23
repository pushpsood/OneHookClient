import { describe, expect, it } from 'vitest';
import {
  buildMemberChatRequestBody,
  classifyMemberChatAvailability,
  isSessionErrorCode,
  parseMemberChatResponse,
  matchSuggestionNote,
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

describe('classifyMemberChatAvailability — entitlement/auth gating', () => {
  it('classifies 402 MESSAGE_LIMIT_REACHED as LIMIT_REACHED (free tier daily allowance)', () => {
    expect(classifyMemberChatAvailability(402, 'MESSAGE_LIMIT_REACHED')).toBe('LIMIT_REACHED');
    expect(classifyMemberChatAvailability(402, undefined)).toBe('LIMIT_REACHED');
  });

  it('no longer has a group/permission gate: a 403 is not an availability outcome', () => {
    expect(classifyMemberChatAvailability(403, 'INSUFFICIENT_PERMISSION')).toBeUndefined();
    expect(classifyMemberChatAvailability(403, undefined)).toBeUndefined();
  });

  it('parses remainingMessages for free members', () => {
    expect(parseMemberChatResponse({ reply: 'x', mood: 'Happy', remainingMessages: 3 }).remainingMessages).toBe(3);
    expect(parseMemberChatResponse({ reply: 'x', mood: 'Happy' }).remainingMessages).toBeUndefined();
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
    expect(
      parseMemberChatResponse({ reply: 'x', mood: 'Happy', matchSuggestion: { status: 'MATCHING_OFF' } }).matchSuggestion
    ).toEqual({ status: 'MATCHING_OFF', reasoning: '' });
  });

  it('renders a note for each outcome', () => {
    expect(matchSuggestionNote({ status: 'RECORDED', reasoning: 'You asked for a reader' }))
      .toBe('Added to your Discover feed: You asked for a reader');
    expect(matchSuggestionNote({ status: 'PREMIUM_REQUIRED', reasoning: '' })).toMatch(/Upgrade to Super/);
    expect(matchSuggestionNote({ status: 'UNAVAILABLE', reasoning: '' })).toMatch(/try again later/);
    expect(matchSuggestionNote({ status: 'MATCHING_OFF', reasoning: '' })).toMatch(/Turn on matching/);
  });
});

describe('Mr OneHook Pro and attachments: error mapping', () => {
  it('maps attachment upload/poll errors by code, falling back to the status', async () => {
    const { classifyAttachmentError } = await import('../lib/mr-onehook-contract');
    expect(classifyAttachmentError(415, { error: 'UNSUPPORTED_ATTACHMENT_TYPE' })).toEqual({ kind: 'UNSUPPORTED_TYPE' });
    expect(classifyAttachmentError(413, { error: 'ATTACHMENT_TOO_LARGE' })).toEqual({ kind: 'TOO_LARGE' });
    expect(classifyAttachmentError(413, {})).toEqual({ kind: 'TOO_LARGE' });
    expect(
      classifyAttachmentError(429, { error: 'ATTACHMENT_PROCESSING_UNAVAILABLE', retryAt: '2026-12-01T00:00:00Z' }),
    ).toEqual({ kind: 'PROCESSING_UNAVAILABLE', retryAt: '2026-12-01T00:00:00Z' });
    expect(classifyAttachmentError(429, { error: 'RATE_LIMITED' })).toEqual({ kind: 'RATE_LIMITED' });
    expect(classifyAttachmentError(403, { error: 'PRO_REQUIRED' })).toEqual({ kind: 'PRO_REQUIRED' });
    expect(classifyAttachmentError(403, { error: 'MESSAGE_CONTEXT_NOT_ALLOWED' })).toEqual({ kind: 'MESSAGE_CONTEXT_NOT_ALLOWED' });
    expect(classifyAttachmentError(404, { error: 'MATCH_NOT_AVAILABLE' })).toEqual({ kind: 'MATCH_NOT_AVAILABLE' });
    expect(classifyAttachmentError(404, { error: 'ATTACHMENT_NOT_FOUND' })).toEqual({ kind: 'NOT_FOUND' });
    expect(classifyAttachmentError(404, { error: 'ENDPOINT_NOT_FOUND' })).toEqual({ kind: 'NOT_CONFIGURED' });
    expect(classifyAttachmentError(503, { error: 'ATTACHMENTS_NOT_CONFIGURED' })).toEqual({ kind: 'NOT_CONFIGURED' });
    expect(classifyAttachmentError(409, { error: 'ATTACHMENT_NOT_READY' })).toEqual({ kind: 'NOT_READY' });
    expect(classifyAttachmentError(503, { error: 'ATTACHMENTS_TEMPORARILY_UNAVAILABLE' })).toEqual({ kind: 'UNAVAILABLE' });
    expect(classifyAttachmentError(500, null)).toEqual({ kind: 'UNAVAILABLE' });
  });

  it('heavy usage reads as a pause on files, never on chat', async () => {
    const { attachmentProblemCopy, ATTACHMENT_HEAVY_USAGE_COPY } = await import('../lib/mr-onehook-contract');
    expect(ATTACHMENT_HEAVY_USAGE_COPY).toBe(
      "Files can't be processed right now because of heavy usage. You can keep chatting.",
    );
    expect(attachmentProblemCopy({ kind: 'PROCESSING_UNAVAILABLE' })).toBe(ATTACHMENT_HEAVY_USAGE_COPY);
    expect(attachmentProblemCopy({ kind: 'PROCESSING_UNAVAILABLE', retryAt: 'X' }, () => '5 pm')).toBe(
      `${ATTACHMENT_HEAVY_USAGE_COPY} Files work again from 5 pm.`,
    );
    expect(attachmentProblemCopy({ kind: 'MESSAGE_CONTEXT_NOT_ALLOWED' })).toMatch(/doesn't allow/);
  });

  it('chat-turn refusals about files go to the attachment flow; others do not', async () => {
    const { chatTurnAttachmentProblem } = await import('../lib/mr-onehook-contract');
    expect(chatTurnAttachmentProblem(403, 'PRO_REQUIRED')).toEqual({ kind: 'PRO_REQUIRED' });
    expect(chatTurnAttachmentProblem(409, 'ATTACHMENT_NOT_READY')).toEqual({ kind: 'NOT_READY' });
    expect(chatTurnAttachmentProblem(400, 'ATTACHMENT_NOT_USABLE')).toEqual({ kind: 'NOT_USABLE' });
    expect(chatTurnAttachmentProblem(404, 'ATTACHMENT_NOT_FOUND')).toEqual({ kind: 'NOT_FOUND' });
    expect(chatTurnAttachmentProblem(403, 'MESSAGE_CONTEXT_NOT_ALLOWED')).toEqual({ kind: 'MESSAGE_CONTEXT_NOT_ALLOWED' });
    expect(chatTurnAttachmentProblem(409, 'CHAT_SESSION_LIMIT_REACHED')).toBeUndefined();
    expect(chatTurnAttachmentProblem(402, 'MESSAGE_LIMIT_REACHED')).toBeUndefined();
    // The attachment codes never gate the whole chat.
    expect(classifyMemberChatAvailability(403, 'PRO_REQUIRED')).toBeUndefined();
    expect(classifyMemberChatAvailability(409, 'ATTACHMENT_NOT_READY')).toBeUndefined();
  });

  it('maps Pro purchase / auto-renew / continuation errors', async () => {
    const { classifyProError, proProblemCopy } = await import('../lib/mr-onehook-contract');
    expect(classifyProError(402, 'PAYMENT_DECLINED')).toBe('PAYMENT_DECLINED');
    expect(classifyProError(402, undefined)).toBe('PAYMENT_DECLINED');
    expect(classifyProError(409, 'PRO_INCLUDED_IN_MEMBERSHIP')).toBe('INCLUDED_IN_MEMBERSHIP');
    expect(classifyProError(409, 'PRO_ALREADY_ACTIVE')).toBe('ALREADY_ACTIVE');
    expect(classifyProError(409, 'PRO_PURCHASE_IN_PROGRESS')).toBe('PURCHASE_IN_PROGRESS');
    expect(classifyProError(409, 'MEMBERSHIP_NOT_ENDING')).toBe('MEMBERSHIP_NOT_ENDING');
    expect(classifyProError(409, 'CONTINUATION_ALREADY_STARTED')).toBe('CONTINUATION_ALREADY_STARTED');
    expect(classifyProError(409, 'PRO_PAUSED_FOR_MEMBERSHIP')).toBe('PAUSED_FOR_MEMBERSHIP');
    expect(classifyProError(404, 'PRO_SUBSCRIPTION_NOT_FOUND')).toBe('SUBSCRIPTION_NOT_FOUND');
    expect(classifyProError(503, 'PAYMENTS_NOT_CONFIGURED')).toBe('COMING_SOON');
    expect(classifyProError(503, 'PRO_TEMPORARILY_UNAVAILABLE')).toBe('UNAVAILABLE');
    expect(classifyProError(404, 'ENDPOINT_NOT_FOUND')).toBe('PRO_OFF');
    expect(classifyProError(404, undefined)).toBe('PRO_OFF');
    expect(classifyProError(401, 'AUTH_REQUIRED')).toBe('NOT_AUTHENTICATED');
    expect(classifyProError(500, undefined)).toBe('UNAVAILABLE');
    expect(proProblemCopy('PAYMENT_DECLINED')).toMatch(/declined/);
    expect(proProblemCopy('COMING_SOON')).toMatch(/coming soon/i);
    expect(proProblemCopy('INCLUDED_IN_MEMBERSHIP')).toMatch(/already includes/);
  });

  it('the limit copy upsells Mr OneHook Pro, not a membership tier', async () => {
    const source = (await import('node:fs')).readFileSync(new URL('../lib/mr-onehook.ts', import.meta.url), 'utf8');
    expect(source).toContain('Get Mr OneHook Pro for unlimited messages');
    expect(source).not.toContain('Upgrade to Super to keep chatting');
  });

  it('sends attachmentIds only when there are some', () => {
    expect(buildMemberChatRequestBody({ message: 'hi', attachmentIds: ['a', 'b'] }).attachmentIds).toEqual(['a', 'b']);
    expect(buildMemberChatRequestBody({ message: 'hi', attachmentIds: [] })).not.toHaveProperty('attachmentIds');
    expect(buildMemberChatRequestBody({ message: 'hi' })).not.toHaveProperty('attachmentIds');
  });
});

describe('Mr OneHook errors through the generated SDK', () => {
  it('a 413/415/429 from UploadChatAttachment reaches the attachment flow with its code and retryAt', async () => {
    const { MrOneHookService } = await import('onehook-mr-onehook-client');
    const { fetchHandler } = await import('./support/sdk-fetch-handler');
    const { sdkFailure } = await import('../api/external-sdk-clients');
    const { classifyAttachmentError } = await import('../lib/mr-onehook-contract');
    const answers: Array<[number, Record<string, unknown>]> = [
      [413, { error: 'ATTACHMENT_TOO_LARGE' }],
      [415, { error: 'UNSUPPORTED_ATTACHMENT_TYPE' }],
      [429, { error: 'ATTACHMENT_PROCESSING_UNAVAILABLE', retryAt: '2026-12-01T00:00:00Z' }],
    ];
    const seen: Array<Record<string, string>> = [];
    let i = 0;
    const client = new MrOneHookService({
      endpoint: 'https://chatbot.test',
      token: async () => ({ token: 't' }),
      maxAttempts: 1,
      requestHandler: fetchHandler(async (_url, init) => {
        seen.push(init?.headers as Record<string, string>);
        const [status, body] = answers[i++];
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      }),
    });
    const kinds = [];
    for (let n = 0; n < answers.length; n += 1) {
      try {
        await client.uploadChatAttachment({
          body: new Uint8Array([1, 2, 3]),
          contentType: 'image/png',
          fileName: encodeURIComponent('é photo.png'),
          matchId: 'm1',
          sender: 'match',
        });
      } catch (err) {
        const f = sdkFailure(err);
        kinds.push(f ? classifyAttachmentError(f.status, f.body) : null);
      }
    }
    expect(kinds).toEqual([
      { kind: 'TOO_LARGE' },
      { kind: 'UNSUPPORTED_TYPE' },
      { kind: 'PROCESSING_UNAVAILABLE', retryAt: '2026-12-01T00:00:00Z' },
    ]);
    expect(seen[0]['x-attachment-name']).toBe('%C3%A9%20photo.png');
    expect(seen[0]['x-attachment-match-id']).toBe('m1');
    expect(seen[0]['x-attachment-sender']).toBe('match');
  });
});
