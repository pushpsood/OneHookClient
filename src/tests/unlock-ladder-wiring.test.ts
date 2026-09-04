import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard rail: the unlock ladder must be CONSUMED, not just written.
 *
 * This exists because it was already wrong once. The epoch and wrap machinery shipped complete and
 * tested, but nothing called `unlockHistoryKey()` — so wraps were written and never read, every new
 * device stayed "future-only", and the UI fell straight through to the QR fallback even when a device
 * wrap or a passkey could have opened the key with no second device involved. The code all existed; the
 * top of the ladder simply was not connected, and no test noticed.
 *
 * These assertions are deliberately about WIRING rather than behaviour: the failure mode was dead code,
 * which unit tests of that code cannot catch.
 */

const SRC_ROOT = new URL('../', import.meta.url).pathname;

function runtimeSourceFiles(dir = SRC_ROOT): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return path.endsWith('/tests') ? [] : runtimeSourceFiles(path);
    }
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const sources = runtimeSourceFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }));

/** Files that call a manager method, excluding the manager's own definition. */
function callersOf(method: string): string[] {
  return sources
    .filter(
      (file) =>
        !file.path.endsWith('/lib/chat-encryption.ts') && file.text.includes(`${method}(`)
    )
    .map((file) => file.path);
}

describe('history-key unlock ladder wiring', () => {
  it('calls unlockHistoryKey somewhere, so wraps are read and not only written', () => {
    expect(callersOf('unlockHistoryKey')).not.toHaveLength(0);
  });

  it('attempts the silent rungs once per session, not per conversation', () => {
    // Account-level state: a new match changes nothing about it, so this belongs at app level rather
    // than in a per-chat hook that mounts again for every thread.
    const hook = sources.find((f) => f.path.endsWith('/hooks/use-history-unlock.ts'));
    expect(hook).toBeDefined();

    const appContent = sources.find((f) => f.path.endsWith('/app/AppContent.tsx'));
    expect(appContent?.text).toContain('useHistoryUnlock');
  });

  it('does not prompt for a passkey unbidden at sign-in', () => {
    // A biometric dialog appearing on load would be alarming and usually pointless. The app-level call
    // must therefore rely on the silent rungs only.
    const appContent = sources.find((f) => f.path.endsWith('/app/AppContent.tsx'))!;
    const call = /useHistoryUnlock\(([^)]*)\)/.exec(appContent.text);
    expect(call).not.toBeNull();
    expect(call![1]).not.toMatch(/true/);
  });

  it('does try a passkey where the user has explicitly asked to restore', () => {
    // The recovery flow is the one place a prompt is warranted, and trying PRF there is what saves the
    // user from fetching a second device unnecessarily.
    const recovery = sources.find((f) => f.path.endsWith('/hooks/use-key-recovery.ts'))!;
    expect(recovery.text).toContain('unlockHistoryKey');
    expect(recovery.text).toContain('derivePasskeySecret');
  });

  it('caches account-level history state instead of refetching it per chat view', () => {
    // Two GET /chat/history calls per conversation opened, for data that changes almost never, was the
    // original cost of having no cache here.
    const manager = sources.find((f) => f.path.endsWith('/lib/chat-encryption.ts'))!;
    expect(manager.text).toContain('historyStateFresh');
    expect(manager.text).toContain('invalidateHistoryState');
  });

  it('invalidates that cache after every write that changes it', () => {
    const manager = sources.find((f) => f.path.endsWith('/lib/chat-encryption.ts'))!;
    const writes = (manager.text.match(/putHistoryWrap\(|establishHistoryEpoch\(/g) ?? []).length;
    const invalidations = (manager.text.match(/invalidateHistoryState\(\)/g) ?? []).length;
    // One invalidation per write path, plus the private method's own definition.
    expect(invalidations).toBeGreaterThanOrEqual(writes);
  });
});
