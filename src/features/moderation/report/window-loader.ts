/**
 * Evidence-window paging (OneHook moderation Phase 2, docs/MODERATION.md §2, §9.3).
 *
 * The AppSync `getMessages(matchId: ID!, after: AWSTimestamp): [Message]` resolver (verified
 * read-only in OneHookBackend `packages/chat/infra/resolvers/get-messages.js`) is a DynamoDB
 * `Query` keyed `matchId = :matchId AND timestamp > :after`, `scanIndexForward: true`. It returns
 * `ctx.result.items` — a SINGLE DynamoDB page (the ~1 MB service limit), oldest-first — and exposes
 * no `limit` and no `nextToken`. So:
 *
 *   - a single call is NOT guaranteed complete for a long conversation, and
 *   - because it returns OLDEST-first, a single call can omit the MOST RECENT messages — exactly the
 *     ones the evidence window (last 200 / last 30 days) needs.
 *
 * The resolver DOES page: passing `after = <last timestamp seen>` returns the next slice. This helper
 * therefore seeds the cursor at the 30-day cutoff (so we only read the window, not all history) and
 * pages FORWARD until a page is empty, the cursor stops advancing, or a hard page cap is hit. The
 * 200-message cap is applied downstream by `selectEvidenceWindow`, which keeps the most-recent tail
 * of whatever this returns.
 *
 * Pure and fully injectable (no network, no clock) so it is unit-testable.
 */
import { EVIDENCE_WINDOW } from './evidence-bundle';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CollectWindowDeps<T> {
  /** Fetch one page of messages with `timestamp > after` (oldest-first). `after` undefined/0 = from start. */
  fetchPage: (after: number | undefined) => Promise<readonly T[]>;
  /** Epoch-ms timestamp of an item (the chat stores `Date.now()` ms; the cursor unit matches). */
  getTimestamp: (item: T) => number;
  /** Stable id of an item, used to de-duplicate across page boundaries. */
  getId: (item: T) => string;
}

export interface CollectWindowOptions {
  nowMs?: number;
  /** Window length in days (default 30). */
  maxDays?: number;
  /** Hard safety cap on page fetches so the loop is always bounded (default 50). */
  maxPages?: number;
}

/**
 * Page the message history forward until the whole evidence window (last `maxDays`) is covered or a
 * cap bites. Returns the collected items oldest-first, de-duplicated by id. The caller still applies
 * the 200-message / 30-day selection.
 */
export async function collectWindowPages<T>(
  deps: CollectWindowDeps<T>,
  opts: CollectWindowOptions = {}
): Promise<T[]> {
  const nowMs = opts.nowMs ?? Date.now();
  const maxDays = opts.maxDays ?? EVIDENCE_WINDOW.maxDays;
  const maxPages = opts.maxPages ?? 50;

  // Seed strictly after the window cutoff so we read only the last `maxDays`, not all history. The
  // resolver treats any `after <= 0` as "from the start", so a non-positive cutoff reads everything.
  const cutoff = Math.max(0, nowMs - maxDays * MS_PER_DAY);

  const collected: T[] = [];
  const seen = new Set<string>();
  let after: number | undefined = cutoff > 0 ? cutoff : undefined;

  for (let page = 0; page < maxPages; page++) {
    const items = await deps.fetchPage(after);
    if (!items || items.length === 0) break;

    let maxTs = after ?? Number.NEGATIVE_INFINITY;
    for (const item of items) {
      const id = deps.getId(item);
      if (!seen.has(id)) {
        seen.add(id);
        collected.push(item);
      }
      const ts = deps.getTimestamp(item);
      if (ts > maxTs) maxTs = ts;
    }

    // Advance the cursor to the newest timestamp this page returned. If it did not advance past the
    // current cursor, there is nothing further to page (and we must not loop forever).
    if (after !== undefined && maxTs <= after) break;
    after = maxTs;
  }

  return collected;
}
