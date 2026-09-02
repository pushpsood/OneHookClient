import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard rail for undecryptable-message rendering.
 *
 * `decryptInbound` (hooks/use-api.ts) represents a message this device holds no key for as an EMPTY
 * body plus `undecryptable: true`. That choice keeps the "[Unable to decrypt]" string out of the UI,
 * but it means any surface that renders `ciphertext` WITHOUT branching on `undecryptable` shows a
 * silent blank bubble — no explanation and no way to reach history recovery.
 *
 * That is not hypothetical: the inline conversation panel in MatchesView shipped exactly that bug
 * while the full-page ChatView handled it correctly, because the two render paths were copies that
 * drifted. This test fails if a new (or reverted) surface renders a message body without the branch.
 */

const SRC_ROOT = new URL('../', import.meta.url).pathname;

function runtimeSourceFiles(dir = SRC_ROOT): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return path.endsWith('/tests') ? [] : runtimeSourceFiles(path);
    }
    return /\.tsx$/.test(entry) ? [path] : [];
  });
}

/**
 * Identifies a chat message-list renderer: it maps over the decrypted `messages` array and puts the
 * body on screen. Matching on structure rather than an exact JSX spelling keeps the guard working
 * whether the body is written `{m.ciphertext}` on one line or as a multi-line ternary branch.
 */
function rendersMessageBodies(text: string): boolean {
  return /messages\s*\.\s*map\s*\(/.test(text) && /\.ciphertext\b/.test(text);
}

const sources = runtimeSourceFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe('locked message rendering', () => {
  const renderers = sources.filter((file) => rendersMessageBodies(file.text));

  it('finds the chat surfaces that render a message body', () => {
    // Sanity check on the scan itself: if this hits zero the regex has rotted and the assertions
    // below would pass vacuously.
    expect(renderers.length).toBeGreaterThan(0);
  });

  it.each(renderers.map((file) => file.path))(
    'branches on `undecryptable` before rendering a body in %s',
    (path) => {
      const file = renderers.find((candidate) => candidate.path === path)!;
      expect(file.text).toMatch(/\w+\.undecryptable\s*\?/);
    }
  );

  it.each(renderers.map((file) => file.path))(
    'offers a route into history recovery from %s',
    (path) => {
      const file = renderers.find((candidate) => candidate.path === path)!;
      // A locked bubble that cannot start a transfer is a dead end, which is the actual user-visible
      // failure — the message stays unreadable with nothing to click.
      expect(file.text).toContain('LockedMessageNotice');
      expect(file.text).toContain('HistoryRecoveryModal');
    }
  );
});
