import { describe, expect, it } from 'vitest';
import {
  buildMemberChatRequestBody,
  evictionNotice,
  isSessionErrorCode,
  isSessionLimitRace,
  parseMemberChatResponse,
  parseSessionDetail,
  parseSessionList,
} from '../lib/mr-onehook-contract';

const item = (id: string, updatedAt: string, scope = 'product') => ({
  sessionId: id, scope, createdAt: updatedAt, updatedAt, expiresAt: updatedAt, messageCount: 4,
});

describe('saved Mr. OneHook chats (every plan: Free 1, Pro 3)', () => {
  it('never sends replaceLeastRecent: the server replaces the least recent chat at the cap', () => {
    expect(buildMemberChatRequestBody({ message: 'hi', persist: true }).sessionOptions).toEqual({ persist: true });
    expect(buildMemberChatRequestBody({ message: 'hi', sessionId: 's1' }).sessionOptions)
      .toEqual({ persist: true, sessionId: 's1' });
    expect(buildMemberChatRequestBody({ message: 'hi' }).sessionOptions).toBeUndefined();
  });

  it('reads evictedSessionIds and the plan from a reply', () => {
    const r = parseMemberChatResponse({
      reply: 'ok', mood: 'Happy', evictedSessionIds: ['a', 7, '', 'b'], plan: 'FREE',
      contextUsed: { attachmentCount: 2 },
    });
    expect(r.evictedSessionIds).toEqual(['a', 'b']);
    expect(r.plan).toBe('FREE');
    expect(r.contextUsed?.attachmentCount).toBe(2);
    const none = parseMemberChatResponse({ reply: 'ok', mood: 'Happy', evictedSessionIds: [], plan: 'GOLD' });
    expect(none.evictedSessionIds).toBeUndefined();
    expect(none.plan).toBeUndefined();
  });

  it('a 409 CHAT_SESSION_LIMIT_REACHED is a race to retry once, then a session error', () => {
    expect(isSessionLimitRace(409, 'CHAT_SESSION_LIMIT_REACHED')).toBe(true);
    expect(isSessionLimitRace(409, 'ATTACHMENT_NOT_READY')).toBe(false);
    expect(isSessionLimitRace(503, 'CHAT_SESSION_LIMIT_REACHED')).toBe(false);
    expect(isSessionErrorCode('CHAT_SESSION_LIMIT_REACHED')).toBe(true);
  });

  it('parses the session list and a saved chat (with its files) for resuming', () => {
    expect(parseSessionList({ sessions: [item('a', 'x'), item('b', 'y', 'connection'), item('c', 'z', 'bad')] })
      .map((s) => s.sessionId)).toEqual(['a', 'b']);
    const detail = parseSessionDetail({
      session: {
        sessionId: 'a', createdAt: 'c', updatedAt: 'u', expiresAt: 'e',
        messages: [
          {
            role: 'user', content: 'hello', createdAt: 't',
            attachments: [
              { attachmentId: 'f1', name: 'menu.pdf', kind: 'document', sizeBytes: 10, source: 'upload' },
              { name: 'photo.jpg', kind: 'image', source: 'match_chat' },
              { name: 'bad', kind: 'exe', source: 'upload' },
            ],
          },
          { role: 'system', content: 'x' },
          7,
        ],
      },
    });
    expect(detail?.messages).toEqual([
      {
        role: 'user', content: 'hello', createdAt: 't',
        attachments: [
          { attachmentId: 'f1', name: 'menu.pdf', kind: 'document', sizeBytes: 10, source: 'upload' },
          { name: 'photo.jpg', kind: 'image', source: 'match_chat' },
        ],
      },
    ]);
    expect(parseSessionDetail({ session: { sessionId: 'a' } })).toBeUndefined();
  });
});

describe('Mr. OneHook chat tabs and evictions', () => {
  const s = (id: string, created: string, updated: string) => ({
    sessionId: id, scope: 'product' as const, createdAt: created, updatedAt: updated, expiresAt: '', messageCount: 2,
  });

  it('a new member sees one New chat tab; a Free member with a saved chat sees it', async () => {
    const { mrOneHookTabs } = await import('../lib/mr-onehook');
    expect(mrOneHookTabs([], undefined, false).map((t) => t.title)).toEqual(['New chat']);
    expect(mrOneHookTabs([s('a', '1', '2')], 'a', false).map((t) => t.title)).toEqual(['Chat 1']);
  });

  it('saved chats oldest first, plus New chat while unsaved', async () => {
    const { mrOneHookTabs } = await import('../lib/mr-onehook');
    const saved = [s('b', '2026-11-02', '2026-11-04'), s('a', '2026-11-01', '2026-11-03')];
    expect(mrOneHookTabs(saved, 'a', false).map((t) => t.title)).toEqual(['Chat 1', 'Chat 2']);
    expect(mrOneHookTabs(saved, undefined, false).map((t) => t.title)).toEqual(['Chat 1', 'Chat 2', 'New chat']);
  });

  it('replacing drops the least recently used chat; never more than 3 tabs', async () => {
    const { mrOneHookTabs, leastRecentSession } = await import('../lib/mr-onehook');
    const saved = [s('a', '1', '9'), s('b', '2', '3'), s('c', '3', '7')];
    expect(leastRecentSession(saved)?.sessionId).toBe('b');
    const tabs = mrOneHookTabs(saved, undefined, true);
    expect(tabs.map((t) => t.sessionId)).toEqual(['a', 'c', undefined]);
  });

  it('evictedSessionIds removes those tabs and says so', async () => {
    const { applyEvictions } = await import('../lib/mr-onehook');
    const saved = [s('a', '1', '9'), s('b', '2', '3'), s('c', '3', '7')];
    const one = applyEvictions(saved, ['b']);
    expect(one.sessions.map((x) => x.sessionId)).toEqual(['a', 'c']);
    expect(one.notice).toBe('Your oldest chat was replaced');
    expect(applyEvictions(saved, ['a', 'b']).notice).toBe(evictionNotice(2));
    expect(applyEvictions(saved, undefined)).toEqual({ sessions: saved, notice: null });
    expect(applyEvictions(saved, [])).toEqual({ sessions: saved, notice: null });
  });
});
