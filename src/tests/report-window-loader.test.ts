/**
 * Evidence-window paging (OneHook moderation Phase 2, docs/MODERATION.md §2).
 *
 * `getMessages(matchId, after)` returns ONE oldest-first DynamoDB page per call (no limit /
 * nextToken), so `collectWindowPages` must page FORWARD with the `after` cursor to cover the whole
 * window. These tests inject a fake `fetchPage` (no network) and assert: the cursor is seeded at the
 * 30-day cutoff (older messages are never requested), the loop pages to completeness, it de-dupes
 * across page boundaries, and it is always bounded (page cap + non-advancing-cursor guard).
 */
import { describe, it, expect } from 'vitest';
import { collectWindowPages } from '../features/moderation/report/window-loader';

const NOW = Date.parse('2026-10-26T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

interface Msg {
  messageId: string;
  timestamp: number;
}

/** A fake AppSync `getMessages`: returns up to `pageSize` messages with timestamp > after, ascending. */
function makeFetchPage(all: Msg[], pageSize: number, calls: (number | undefined)[]) {
  const sorted = [...all].sort((a, b) => a.timestamp - b.timestamp);
  return async (after: number | undefined): Promise<Msg[]> => {
    calls.push(after);
    const start = after ?? 0;
    return sorted.filter((m) => m.timestamp > start).slice(0, pageSize);
  };
}

const deps = (fetchPage: (after: number | undefined) => Promise<Msg[]>) => ({
  fetchPage,
  getTimestamp: (m: Msg) => m.timestamp,
  getId: (m: Msg) => m.messageId,
});

describe('collectWindowPages', () => {
  it('pages forward to completeness across multiple pages', async () => {
    const all: Msg[] = Array.from({ length: 5 }, (_, i) => ({
      messageId: `m${i}`,
      timestamp: NOW - (5 - i) * 1000, // all within the last 30 days
    }));
    const calls: (number | undefined)[] = [];
    const out = await collectWindowPages(deps(makeFetchPage(all, 2, calls)), { nowMs: NOW });
    expect(out.map((m) => m.messageId)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
    // 3 content pages (2+2+1) + 1 trailing empty page that ends the loop.
    expect(calls.length).toBe(4);
  });

  it('seeds the cursor at the 30-day cutoff so older messages are never requested', async () => {
    const all: Msg[] = [
      { messageId: 'old', timestamp: NOW - 40 * DAY }, // outside the window
      { messageId: 'new1', timestamp: NOW - 2 * DAY },
      { messageId: 'new2', timestamp: NOW - 1 * DAY },
    ];
    const calls: (number | undefined)[] = [];
    const out = await collectWindowPages(deps(makeFetchPage(all, 10, calls)), { nowMs: NOW, maxDays: 30 });
    expect(out.map((m) => m.messageId)).toEqual(['new1', 'new2']);
    // The first cursor is the cutoff (~30 days ago), strictly after the 40-day-old message.
    expect(calls[0]).toBe(NOW - 30 * DAY);
    expect(out.find((m) => m.messageId === 'old')).toBeUndefined();
  });

  it('de-duplicates items that reappear across page boundaries', async () => {
    const shared = { messageId: 'dup', timestamp: NOW - 1000 };
    let n = 0;
    const calls: (number | undefined)[] = [];
    const fetchPage = async (after: number | undefined): Promise<Msg[]> => {
      calls.push(after);
      n += 1;
      if (n === 1) return [{ messageId: 'a', timestamp: NOW - 3000 }, shared];
      if (n === 2) return [shared, { messageId: 'b', timestamp: NOW - 500 }];
      return [];
    };
    const out = await collectWindowPages(deps(fetchPage), { nowMs: NOW });
    expect(out.map((m) => m.messageId)).toEqual(['a', 'dup', 'b']);
  });

  it('is bounded by the page cap', async () => {
    const all: Msg[] = Array.from({ length: 100 }, (_, i) => ({
      messageId: `m${i}`,
      timestamp: NOW - (100 - i) * 1000,
    }));
    const calls: (number | undefined)[] = [];
    const out = await collectWindowPages(deps(makeFetchPage(all, 1, calls)), { nowMs: NOW, maxPages: 3 });
    expect(out.length).toBe(3); // exactly maxPages fetches, 1 item each
    expect(calls.length).toBe(3);
  });

  it('stops when the cursor cannot advance (no infinite loop)', async () => {
    // A pathological page that always returns the same single item: the cursor never advances.
    const stuck = { messageId: 'x', timestamp: NOW - 1000 };
    let n = 0;
    const fetchPage = async (): Promise<Msg[]> => {
      n += 1;
      return [stuck];
    };
    const out = await collectWindowPages(deps(fetchPage), { nowMs: NOW, maxPages: 50 });
    expect(out.map((m) => m.messageId)).toEqual(['x']);
    expect(n).toBeLessThanOrEqual(2); // first fetch, then the non-advance guard breaks
  });
});
