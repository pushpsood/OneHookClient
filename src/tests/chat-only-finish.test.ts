import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Chat-only profiles, the remaining web pieces: the one error body every service answers
 * (`{error: <message>, code: <CODE>}`, optional `traceId` / `retryable`), suspended writes and calls,
 * and the telemetry ids the matching profile's prompt and voice controls report.
 */
vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: async () => ({ tokens: undefined }) }));

import { bodyCode, errorCode, errorGaps, errorMessage } from '../lib/api-errors';
import { ApiError } from '../lib/api-client';
import { GraphQLOperationError } from '../api/graphql-error';
import { SUSPENDED_CALL_COPY, friendlyCallError, isConversationSuspended } from '../lib/call-errors';
import { UiElement } from '../lib/analytics/analytics';
import { uiElementsForPlatform } from '../lib/analytics/generated/telemetryCatalog';
import { enableFailure } from '../features/settings/matching-mode';
import { SwipeApi } from '../api/rest';

/**
 * What the Smithy SDK throws for an error body: `name` is the body's `code`, every body field is
 * copied onto the exception, and `message` is the SDK's "UnknownError" placeholder (the body has none).
 */
const sdkException = (status: number, body: Record<string, unknown>) =>
  Object.assign(new Error('UnknownError'), {
    name: typeof body.code === 'string' ? body.code : 'UnknownError',
    $metadata: { httpStatusCode: status },
    ...body,
  });

afterEach(() => vi.unstubAllGlobals());

describe('the error body every service answers: {error: <message>, code: <CODE>}', () => {
  it('State and Profile', () => {
    const err = sdkException(409, { error: 'You have no free hook slot', code: 'CONNECTION_LIMIT' });
    expect(errorCode(err)).toBe('CONNECTION_LIMIT');
    expect(errorMessage(err, 'fallback')).toBe('You have no free hook slot');
  });

  it('Matching', () => {
    const err = sdkException(403, {
      error: 'Matching is off for this member',
      code: 'MATCHING_OFF',
      traceId: 't-1',
      retryable: false,
    });
    expect(errorCode(err)).toBe('MATCHING_OFF');
    expect(errorMessage(err, 'fallback')).toBe('Matching is off for this member');
  });

  it('the generic codes are BAD_REQUEST and NOT_FOUND', () => {
    expect(errorCode(sdkException(400, { error: 'comment is required', code: 'BAD_REQUEST' }))).toBe('BAD_REQUEST');
    expect(errorCode(sdkException(404, { error: 'No such profile', code: 'NOT_FOUND' }))).toBe('NOT_FOUND');
  });

  it('the code comes only from `code`: a code-shaped `error` is text, not a code', () => {
    expect(bodyCode({ error: 'MATCHING_OFF' })).toBeUndefined();
    expect(bodyCode({ error: 'Not ready yet' })).toBeUndefined();
    expect(errorCode(sdkException(500, { error: 'Internal error' }))).toBeUndefined();
  });

  it('never shows the SDK placeholder "UnknownError"', () => {
    expect(errorMessage(sdkException(500, { code: 'INTERNAL_ERROR' }), 'Try again.')).toBe('Try again.');
    expect(errorMessage(new ApiError('Discovery is paused', 403, 'DISCOVERY_PAUSED'), 'x')).toBe('Discovery is paused');
    expect(errorMessage(new TypeError('Failed to fetch'), 'x')).toBe('Failed to fetch');
    expect(errorMessage(undefined, 'x')).toBe('x');
  });

  it('enable: 409 MATCHING_PROFILE_INCOMPLETE lists every gap State can send', () => {
    const gaps = ['PHOTOS', 'GENDER', 'INTERESTED_IN', 'NO_CHAT_PROFILE', 'NO_MATCHING_PROFILE'];
    const err = sdkException(409, { error: 'Matching profile incomplete', code: 'MATCHING_PROFILE_INCOMPLETE', gaps });
    expect(errorGaps(err)).toEqual(gaps);
    expect(enableFailure(err).gaps).toEqual(gaps);
    expect(enableFailure(sdkException(409, { error: 'x', code: 'MATCHING_ERASING' })).message).toMatch(/still being removed/);
    expect(enableFailure(sdkException(409, { error: 'x', code: 'NOT_READY' })).message).toMatch(/Finish setting up/);
  });

  it('the REST helper reads a Matching body into ApiError (code and message)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Discovery is paused', code: 'DISCOVERY_PAUSED' }), { status: 403 })
      )
    );
    const err = await SwipeApi.pass('u1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).code).toBe('DISCOVERY_PAUSED');
    expect((err as ApiError).message).toBe('Discovery is paused');
    expect(errorCode(err)).toBe('DISCOVERY_PAUSED');
  });

  it('the REST helper ignores a body without `code` for the code, and keeps its text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'BAD_REQUEST' }), { status: 400 }))
    );
    const err = (await SwipeApi.pass('u1').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(400);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('BAD_REQUEST');
  });

  it('the REST helper reads a State body the same way', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Too many reports today', code: 'RATE_LIMITED' }), { status: 429 }))
    );
    const err = (await SwipeApi.pass('u1').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('Too many reports today');
  });
});

describe('suspended chats', () => {
  it('recognises CONVERSATION_SUSPENDED from AppSync and from REST', () => {
    expect(isConversationSuspended(new GraphQLOperationError('paused', 'CONVERSATION_SUSPENDED'))).toBe(true);
    expect(isConversationSuspended(sdkException(409, { error: 'x', code: 'CONVERSATION_SUSPENDED' }))).toBe(true);
    expect(isConversationSuspended(new GraphQLOperationError('no', 'CallNotAllowed'))).toBe(false);
  });

  it('a refused startCall explains that calls are paused', () => {
    expect(friendlyCallError(new GraphQLOperationError('raw', 'CONVERSATION_SUSPENDED'))).toBe(SUSPENDED_CALL_COPY);
    expect(SUSPENDED_CALL_COPY).toMatch(/paused/);
  });
});

describe('matching profile prompt and voice telemetry ids', () => {
  it('onboarding.prompt_* / onboarding.voice_* are legacy: out of web scope, still in the catalog', () => {
    const web = new Set(uiElementsForPlatform('web'));
    for (const id of [
      UiElement.ONBOARDING_PROMPT_ADD,
      UiElement.ONBOARDING_PROMPT_REMOVE,
      UiElement.ONBOARDING_VOICE_ADD,
      UiElement.ONBOARDING_VOICE_REMOVE,
    ]) {
      expect(web.has(id)).toBe(false);
    }
  });

  it('the matching profile prompt and voice controls report profile_edit.*, which web keeps in scope', () => {
    const web = new Set(uiElementsForPlatform('web'));
    for (const id of [
      UiElement.PROFILE_EDIT_PROMPT_ADD,
      UiElement.PROFILE_EDIT_PROMPT_REMOVE,
      UiElement.PROFILE_EDIT_VOICE_ADD,
      UiElement.PROFILE_EDIT_VOICE_REMOVE,
    ]) {
      expect(web.has(id)).toBe(true);
    }
  });
});
