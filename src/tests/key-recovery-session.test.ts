import { describe, expect, it } from 'vitest';
import {
  isLiveSession,
  recoveryCandidates,
  responderActionFor,
  selectIncomingRequest,
  targetPhaseFor,
} from '../lib/key-recovery-session';
import type { KeyRecoverySession } from '../api/key-recovery';
import type { DeviceSummary } from '../lib/chat-encryption';

/**
 * The recovery flow's decision rules. Each case here corresponds to a way the flow could fail
 * QUIETLY — the prompt that will not go away, the device that cannot possibly help, the stale request
 * that hijacks a fresh one — rather than with an error the user could report.
 */

const NOW = 1_700_000_000_000;

function session(overrides: Partial<KeyRecoverySession> = {}): KeyRecoverySession {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    sourceDeviceId: 'device-old',
    targetDeviceId: 'device-new',
    targetEphemeralPublicKey: 'KEY',
    challenge: 'CHALLENGE',
    status: 'PENDING',
    createdAt: NOW - 1_000,
    expiresAt: NOW + 60_000,
    ...overrides,
  };
}

function device(overrides: Partial<DeviceSummary> = {}): DeviceSummary {
  return {
    deviceId: 'device-a',
    platform: 'WEB',
    maxEnvelopeVersion: 2,
    isCurrentDevice: false,
    ...overrides,
  };
}

describe('isLiveSession', () => {
  it('accepts pending and displaying sessions that have not expired', () => {
    expect(isLiveSession(session(), NOW)).toBe(true);
    expect(isLiveSession(session({ status: 'DISPLAYING' }), NOW)).toBe(true);
  });

  it('rejects expired sessions, so an abandoned request cannot re-open a prompt', () => {
    expect(isLiveSession(session({ expiresAt: NOW }), NOW)).toBe(false);
    expect(isLiveSession(session({ expiresAt: NOW - 1 }), NOW)).toBe(false);
  });

  it('rejects finished sessions', () => {
    expect(isLiveSession(session({ status: 'COMPLETED' }), NOW)).toBe(false);
    expect(isLiveSession(session({ status: 'DECLINED' }), NOW)).toBe(false);
  });
});

describe('recoveryCandidates', () => {
  it('never offers this device — it is the one missing the key', () => {
    const devices = [device({ deviceId: 'self', isCurrentDevice: true }), device({ deviceId: 'other' })];
    expect(recoveryCandidates(devices).map((d) => d.deviceId)).toEqual(['other']);
  });

  it('never offers a revoked device, whose key is no longer in the registry to authenticate against', () => {
    const devices = [device({ deviceId: 'gone', revoked: true }), device({ deviceId: 'live' })];
    expect(recoveryCandidates(devices).map((d) => d.deviceId)).toEqual(['live']);
  });

  it('puts the most recently active device first — usually the one in the user’s other hand', () => {
    const devices = [
      device({ deviceId: 'stale', lastSeenAt: 1 }),
      device({ deviceId: 'fresh', lastSeenAt: 99 }),
      device({ deviceId: 'unknown' }),
    ];
    expect(recoveryCandidates(devices).map((d) => d.deviceId)).toEqual([
      'fresh',
      'stale',
      'unknown',
    ]);
  });

  it('returns nothing when the account has no other usable device', () => {
    expect(recoveryCandidates([device({ isCurrentDevice: true })])).toEqual([]);
  });
});

describe('selectIncomingRequest', () => {
  it('picks the newest live request', () => {
    const chosen = selectIncomingRequest(
      [
        session({ sessionId: 'older', createdAt: NOW - 5_000 }),
        session({ sessionId: 'newer', createdAt: NOW - 100 }),
      ],
      NOW
    );
    expect(chosen?.sessionId).toBe('newer');
  });

  it('ignores expired and finished requests even when they are the newest', () => {
    const chosen = selectIncomingRequest(
      [
        session({ sessionId: 'live', createdAt: NOW - 5_000 }),
        session({ sessionId: 'expired', createdAt: NOW - 10, expiresAt: NOW - 1 }),
        session({ sessionId: 'done', createdAt: NOW - 5, status: 'COMPLETED' }),
      ],
      NOW
    );
    expect(chosen?.sessionId).toBe('live');
  });

  it('returns undefined when nothing is actionable', () => {
    expect(selectIncomingRequest([], NOW)).toBeUndefined();
    expect(selectIncomingRequest([session({ status: 'DECLINED' })], NOW)).toBeUndefined();
  });
});

describe('targetPhaseFor', () => {
  it('maps each status to the screen the new device should show', () => {
    expect(targetPhaseFor('PENDING')).toBe('wait');
    expect(targetPhaseFor('DISPLAYING')).toBe('scan');
    expect(targetPhaseFor('DECLINED')).toBe('declined');
    expect(targetPhaseFor('COMPLETED')).toBe('done');
  });
});

describe('responderActionFor', () => {
  it('prompts the user when this device can actually hand the key over', () => {
    expect(
      responderActionFor({ session: session(), now: NOW, holdsHistoryKey: true })
    ).toBe('adopt');
  });

  it('declines instead of going silent when this device has no history key', () => {
    // The regression this guards: a device without the key used to do nothing at all — it did not even
    // subscribe — so the asking device sat on "waiting for your other device" until the session
    // expired, with nothing indicating it had picked a device that could never help.
    expect(
      responderActionFor({ session: session(), now: NOW, holdsHistoryKey: false })
    ).toBe('refuse');
  });

  it('declines a session only once, so the poll cannot spam updates', () => {
    expect(
      responderActionFor({
        session: session({ sessionId: 'session-9' }),
        now: NOW,
        holdsHistoryKey: false,
        refusedSessionId: 'session-9',
      })
    ).toBe('ignore');
  });

  it('still declines a DIFFERENT session after refusing one', () => {
    expect(
      responderActionFor({
        session: session({ sessionId: 'session-10' }),
        now: NOW,
        holdsHistoryKey: false,
        refusedSessionId: 'session-9',
      })
    ).toBe('refuse');
  });

  it('ignores the session already on screen, so a poll does not restart the prompt', () => {
    expect(
      responderActionFor({
        session: session({ sessionId: 'session-live' }),
        now: NOW,
        holdsHistoryKey: true,
        currentSessionId: 'session-live',
      })
    ).toBe('ignore');
  });

  it('ignores an expired request rather than prompting for a dead transfer', () => {
    expect(
      responderActionFor({
        session: session({ expiresAt: NOW - 1 }),
        now: NOW,
        holdsHistoryKey: true,
      })
    ).toBe('ignore');
  });

  it('ignores a request already finished on the other side', () => {
    for (const status of ['COMPLETED', 'DECLINED'] as const) {
      expect(
        responderActionFor({ session: session({ status }), now: NOW, holdsHistoryKey: true })
      ).toBe('ignore');
    }
  });

  it('does not try to refuse an expired request', () => {
    // Declining a dead session would fail its condition server-side and surface a pointless error.
    expect(
      responderActionFor({
        session: session({ expiresAt: NOW - 1 }),
        now: NOW,
        holdsHistoryKey: false,
      })
    ).toBe('ignore');
  });

  it('adopts a DISPLAYING session, so a reconnecting source device recovers its own prompt', () => {
    expect(
      responderActionFor({ session: session({ status: 'DISPLAYING' }), now: NOW, holdsHistoryKey: true })
    ).toBe('adopt');
  });
});
