import { describe, expect, it } from 'vitest';
import {
  buildMemberChatRequestBody,
  parseSessionDetail,
  parseSessionList,
  sessionLimitFromError,
} from '../lib/mr-onehook-contract';

const item = (id: string, updatedAt: string, scope = 'product') => ({
  sessionId: id, scope, createdAt: updatedAt, updatedAt, expiresAt: updatedAt, messageCount: 4,
});

describe('saved Mr. OneHook chats (Super and above)', () => {
  it('asks to replace the least recent chat only for a new saved chat', () => {
    expect(buildMemberChatRequestBody({ message: 'hi', persist: true, replaceLeastRecent: true }).sessionOptions)
      .toEqual({ persist: true, replaceLeastRecent: true });
    expect(buildMemberChatRequestBody({ message: 'hi', persist: true }).sessionOptions).toEqual({ persist: true });
    // Continuing a chat never replaces anything.
    expect(buildMemberChatRequestBody({ message: 'hi', sessionId: 's1', replaceLeastRecent: true }).sessionOptions)
      .toEqual({ persist: true, sessionId: 's1' });
  });

  it('turns a 409 limit for a new chat into a choice, listing the saved chats', () => {
    const limit = sessionLimitFromError(
      { error: 'CHAT_SESSION_LIMIT_REACHED', maxSessions: 3, sessions: [item('a', '2026-11-04T10:00:00Z'), { junk: true }] },
      false,
    );
    expect(limit?.maxSessions).toBe(3);
    expect(limit?.sessions.map((s) => s.sessionId)).toEqual(['a']);
    expect(sessionLimitFromError({ error: 'CHAT_SESSION_LIMIT_REACHED' }, true)).toBeUndefined();
    expect(sessionLimitFromError({ error: 'CHAT_SESSION_NOT_FOUND' }, false)).toBeUndefined();
    expect(sessionLimitFromError({ error: 'CHAT_SESSION_LIMIT_REACHED' }, false)?.maxSessions).toBe(3);
  });

  it('parses the session list and a saved chat for resuming', () => {
    expect(parseSessionList({ sessions: [item('a', 'x'), item('b', 'y', 'connection'), item('c', 'z', 'bad')] })
      .map((s) => s.sessionId)).toEqual(['a', 'b']);
    const detail = parseSessionDetail({
      session: {
        sessionId: 'a', createdAt: 'c', updatedAt: 'u', expiresAt: 'e',
        messages: [{ role: 'user', content: 'hello', createdAt: 't' }, { role: 'system', content: 'x' }, 7],
      },
    });
    expect(detail?.messages).toEqual([{ role: 'user', content: 'hello', createdAt: 't' }]);
    expect(parseSessionDetail({ session: { sessionId: 'a' } })).toBeUndefined();
  });
});
