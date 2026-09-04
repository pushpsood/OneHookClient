import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guard rail: user-facing copy and module docs must not assert limitations the code no longer has.
 *
 * This exists because all three drifted at once. The device card told users older messages "stay on the
 * original device" — permanent-sounding, and wrong, since such a device can usually unlock with one
 * biometric prompt. The QR panel said a saved image "works the same way", which invites using it as a
 * backup, the one use that silently destroys data. And two module headers still described the
 * race-winner/`future-only` model as current, which is how a maintainer adding another platform would
 * faithfully reproduce the bug this work removed.
 *
 * Wrong documentation is not cosmetic here: it is the fastest thing both users and maintainers trust.
 */

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

describe('history-key status copy', () => {
  const card = read('../components/profile/DeviceManagementCard.tsx');

  it('does not tell the user their history is stuck on another device', () => {
    expect(card).not.toContain('stay on the original device');
  });

  it('names a way forward instead of only stating the problem', () => {
    expect(card).toMatch(/passkey/i);
    expect(card).toMatch(/approve this device/i);
  });

  it('models the status as binary, with no third dead-end state', () => {
    const manager = read('../lib/chat-encryption.ts');
    expect(manager).toContain("export type HistoryKeyStatus = 'holding' | 'not-yet';");
  });
});

describe('saved QR copy', () => {
  const responder = read('../components/chat/KeyRecoveryResponder.tsx');

  it('does not claim a saved image behaves like the live code', () => {
    // It does not: clearing the receiving browser's storage makes the file cryptographically inert.
    expect(responder).not.toContain('The saved image works the same way');
  });

  it('says plainly, in the UI, that it is not a backup', () => {
    expect(responder).toContain('Not a backup');
    // JSX escapes the apostrophe, so match on the surrounding wording rather than the character.
    expect(responder).toMatch(/bring your history back later/);
    expect(responder).toMatch(/stops working/);
  });
});

describe('module documentation', () => {
  it('does not present the race-winner model as current', () => {
    for (const file of ['../lib/chat-encryption.ts', '../lib/key-recovery.ts']) {
      const text = read(file);
      // A historical note is fine and useful; asserting it as present tense is not. Both files must at
      // least describe the epoch/wrap model that actually exists.
      expect(text, file).toMatch(/epoch/i);
      expect(text, file).toMatch(/wrap/i);
    }
  });

  it('describes QR as the fallback rather than the mechanism', () => {
    const recovery = read('../lib/key-recovery.ts');
    expect(recovery).toMatch(/fallback/i);
    expect(recovery).toMatch(/unlockHistoryKey/);
  });

  it('keeps the historical note that explains the surviving names', () => {
    // `holdsHistoryKey`, `historyKeyId` and the QR protocol all predate the epoch model; without the
    // note a reader cannot tell why they are shaped the way they are.
    expect(read('../lib/chat-encryption.ts')).toMatch(/Historical note/);
  });
});
