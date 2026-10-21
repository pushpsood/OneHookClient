import { describe, expect, it } from 'vitest';
import {
  CALL_SIGNAL_FRAME_BYTE,
  CALL_SIGNAL_VERSION,
  SAS_EMOJI,
  computeSas,
  extractDtlsFingerprint,
  filterRelayCandidates,
  frameCallSignal,
  isCallSignalFrame,
  isRelayCandidate,
  parseCallSignal,
} from '../lib/call-signal';

/**
 * Pure call-signal guard rails: the 0x02 wire frame, the relay-only candidate filter, DTLS
 * fingerprint parsing, and the fixed SAS safety code. Node ships Web Crypto (globalThis.crypto.subtle)
 * so `computeSas` exercises the real SHA-256 — no mocks. The frame and SAS are a cross-platform
 * contract (OneHookBackend/docs/voice-video-calls.md §8.1), so these pin the exact bytes and emoji.
 */

describe('frameCallSignal / parseCallSignal', () => {
  it('frames with the 0x02 byte then the signal JSON, stamping v:1', () => {
    const framed = frameCallSignal({ t: 'offer', callId: 'c1', sdp: 'v=0' });
    expect(framed.charCodeAt(0)).toBe(CALL_SIGNAL_FRAME_BYTE);
    const parsedJson = JSON.parse(framed.slice(1));
    expect(parsedJson.v).toBe(CALL_SIGNAL_VERSION);
    expect(parsedJson.t).toBe('offer');
    expect(parsedJson.sdp).toBe('v=0');
    expect(isCallSignalFrame(framed)).toBe(true);
  });

  it('round-trips offer / answer / ice / restart signals', () => {
    const offer = parseCallSignal(frameCallSignal({ t: 'offer', callId: 'c1', sdp: 'OFFER' }), 'c1');
    expect(offer).toMatchObject({ v: 1, t: 'offer', callId: 'c1', sdp: 'OFFER' });

    const ice = parseCallSignal(
      frameCallSignal({
        t: 'ice',
        callId: 'c1',
        candidates: [{ candidate: 'candidate:3 1 UDP 1 1.2.3.4 1 typ relay', sdpMid: '0', sdpMLineIndex: 0 }],
      }),
      'c1'
    );
    expect(ice?.candidates).toHaveLength(1);
    expect(ice?.candidates?.[0]).toMatchObject({ sdpMid: '0', sdpMLineIndex: 0 });

    for (const t of ['restart-offer', 'restart-answer'] as const) {
      expect(parseCallSignal(frameCallSignal({ t, callId: 'c1', sdp: 'X' }), 'c1')?.t).toBe(t);
    }
  });

  it('drops a signal whose callId does not match the expected call', () => {
    const framed = frameCallSignal({ t: 'offer', callId: 'other-call', sdp: 'X' });
    expect(parseCallSignal(framed, 'my-call')).toBeNull();
    // With no expected call, it parses (the session has not learnt its callId yet).
    expect(parseCallSignal(framed)?.callId).toBe('other-call');
  });

  it('returns null for a non-0x02 frame, bad JSON, wrong version and unknown type', () => {
    expect(parseCallSignal('plain chat message', 'c1')).toBeNull();
    expect(parseCallSignal(String.fromCharCode(0x02) + '{not json', 'c1')).toBeNull();
    expect(parseCallSignal(String.fromCharCode(0x02) + JSON.stringify({ v: 2, t: 'offer', callId: 'c1' }), 'c1')).toBeNull();
    expect(
      parseCallSignal(String.fromCharCode(0x02) + JSON.stringify({ v: 1, t: 'bogus', callId: 'c1' }), 'c1')
    ).toBeNull();
  });

  it('ignores unknown fields rather than echoing them', () => {
    const framed = String.fromCharCode(0x02) + JSON.stringify({ v: 1, t: 'offer', callId: 'c1', evil: 'x', sdp: 'S' });
    const parsed = parseCallSignal(framed, 'c1');
    expect(parsed).not.toBeNull();
    expect(parsed as object).not.toHaveProperty('evil');
    expect(parsed?.sdp).toBe('S');
  });

  it('treats an attachment (0x01) frame as not a call signal', () => {
    expect(isCallSignalFrame(String.fromCharCode(0x01) + '{}')).toBe(false);
    expect(parseCallSignal(String.fromCharCode(0x01) + '{}', 'c1')).toBeNull();
  });
});

describe('relay-only candidate filter', () => {
  const host = 'candidate:1 1 UDP 2122252543 192.168.1.5 54321 typ host';
  const srflx = 'candidate:2 1 UDP 1686052607 203.0.113.5 54321 typ srflx raddr 192.168.1.5 rport 54321';
  const relay = 'candidate:3 1 UDP 41885439 198.51.100.7 49152 typ relay raddr 203.0.113.5 rport 54321';

  it('keeps only relay candidates', () => {
    expect(isRelayCandidate({ candidate: relay })).toBe(true);
    expect(isRelayCandidate({ candidate: host })).toBe(false);
    expect(isRelayCandidate({ candidate: srflx })).toBe(false);
  });

  it('drops the empty end-of-candidates marker and null', () => {
    expect(isRelayCandidate({ candidate: '' })).toBe(false);
    expect(isRelayCandidate(null)).toBe(false);
  });

  it('does not match "relay" appearing elsewhere in the candidate string', () => {
    expect(isRelayCandidate({ candidate: 'candidate:9 1 UDP 1 relay.example 1 typ host' })).toBe(false);
  });

  it('filterRelayCandidates returns only the relay entries', () => {
    const filtered = filterRelayCandidates([
      { candidate: host },
      { candidate: relay },
      { candidate: srflx },
    ]);
    expect(filtered).toEqual([{ candidate: relay }]);
  });
});

describe('extractDtlsFingerprint', () => {
  const sdp = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
    'a=setup:actpass',
  ].join('\r\n');

  it('returns the fingerprint as uppercase hex with colons', () => {
    expect(extractDtlsFingerprint(sdp)).toBe(
      'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89'
    );
  });

  it('returns null when there is no sha-256 fingerprint or no SDP', () => {
    expect(extractDtlsFingerprint('v=0\r\nm=audio 9 UDP 0')).toBeNull();
    expect(extractDtlsFingerprint(null)).toBeNull();
    expect(extractDtlsFingerprint(undefined)).toBeNull();
  });
});

describe('SAS safety code', () => {
  it('exposes exactly the fixed 64-emoji alphabet', () => {
    expect(SAS_EMOJI).toHaveLength(64);
    expect(SAS_EMOJI[0]).toBe('🐶');
    expect(SAS_EMOJI[63]).toBe('📌');
    expect(new Set(SAS_EMOJI).size).toBe(64); // no duplicates
  });

  // Pinned vector computed independently (node crypto) from the exact §8.1 algorithm.
  const caller = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
  const callee = '11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00';
  const callId = 'call-abc-123';

  it('computes the exact 4-emoji code for a known fingerprint pair', async () => {
    await expect(computeSas(caller, callee, callId)).resolves.toEqual(['🌙', '🚂', '✏️', '⚓']);
  });

  it('matches the cross-platform vector pinned on iOS and Android', async () => {
    await expect(computeSas('AA:BB', 'CC:DD', 'c1')).resolves.toEqual(['😀', '🔒', '🎧', '👓']);
  });

  it('is independent of caller/callee ordering (fingerprints are sorted)', async () => {
    const a = await computeSas(caller, callee, callId);
    const b = await computeSas(callee, caller, callId);
    expect(a).toEqual(b);
  });

  it('changes with the callId, so a captured pair cannot be replayed into another call', async () => {
    const a = await computeSas(caller, callee, callId);
    const b = await computeSas(caller, callee, 'different-call');
    expect(a).not.toEqual(b);
  });

  it('returns null when a fingerprint is missing', async () => {
    await expect(computeSas(null, callee, callId)).resolves.toBeNull();
    await expect(computeSas(caller, undefined, callId)).resolves.toBeNull();
  });
});
