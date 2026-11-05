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

describe('Mr. OneHook chat tabs', () => {
  const s = (id: string, created: string, updated: string) => ({
    sessionId: id, scope: 'product' as const, createdAt: created, updatedAt: updated, expiresAt: '', messageCount: 2,
  });

  it('Must sees one Chat tab', async () => {
    const { mrOneHookTabs } = await import('../lib/mr-onehook');
    expect(mrOneHookTabs([], undefined, false, false).map((t) => t.title)).toEqual(['Chat']);
  });

  it('Super sees saved chats oldest first, plus New chat while unsaved', async () => {
    const { mrOneHookTabs } = await import('../lib/mr-onehook');
    const saved = [s('b', '2026-11-02', '2026-11-04'), s('a', '2026-11-01', '2026-11-03')];
    expect(mrOneHookTabs(saved, 'a', true, false).map((t) => t.title)).toEqual(['Chat 1', 'Chat 2']);
    expect(mrOneHookTabs(saved, undefined, true, false).map((t) => t.title)).toEqual(['Chat 1', 'Chat 2', 'New chat']);
  });

  it('replacing drops the least recently used chat; never more than 3 tabs', async () => {
    const { mrOneHookTabs, leastRecentSession } = await import('../lib/mr-onehook');
    const saved = [s('a', '1', '9'), s('b', '2', '3'), s('c', '3', '7')];
    expect(leastRecentSession(saved)?.sessionId).toBe('b');
    const tabs = mrOneHookTabs(saved, undefined, true, true);
    expect(tabs.map((t) => t.sessionId)).toEqual(['a', 'c', undefined]);
  });
});
