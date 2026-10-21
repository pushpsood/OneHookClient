/**
 * OneHook call signalling — pure framing, relay-only candidate filtering, DTLS fingerprint parsing
 * and the Short Authentication String (SAS) safety code.
 *
 * Every SDP / ICE payload a call exchanges is sealed with the EXISTING chat wire v2 envelope
 * (`encryptV2(plaintext, matchId, targets)`, same `matchId` AAD), exactly like a chat message — see
 * `chat-encryption.ts`. The only difference is the plaintext framing byte: attachments use `0x01`
 * (`chat-attachments.ts`), call signals use `0x02`. This mirrors that convention byte-for-byte so
 * iOS, Android and web interoperate:
 *
 *   plaintext = "\u0002" + JSON.stringify(signal)     -> a call signal
 *   plaintext = <anything else>                        -> not a call signal (chat text / attachment)
 *
 * `0x02` is a control byte a user can never type, so a chat message is never mistaken for a signal
 * and vice versa. The frame is the byte-level contract in OneHookBackend/docs/voice-video-calls.md
 * §8.1 — do not rename a field or change the frame byte here without changing it there.
 *
 * This module is deliberately free of DOM, network and WebRTC dependencies (only the signal shape,
 * strings and Web Crypto `digest`) so it is unit-testable under Node and safe to import anywhere.
 * `RTCIceCandidateInit` is a plain structural type, so filtering does not need a live peer connection.
 */

/** Discriminator byte: a decoded plaintext whose first byte is this is a call signal. */
export const CALL_SIGNAL_FRAME_BYTE = 0x02;

/** The only signal protocol version this build produces and reads. */
export const CALL_SIGNAL_VERSION = 1;

/** The signal kinds that cross the wire. `ice` batches trickled candidates; the rest carry SDP. */
export type CallSignalType = 'offer' | 'answer' | 'ice' | 'restart-offer' | 'restart-answer';

const SIGNAL_TYPES: readonly CallSignalType[] = [
  'offer',
  'answer',
  'ice',
  'restart-offer',
  'restart-answer',
];

/** One trickled ICE candidate, the minimal subset of `RTCIceCandidateInit` that must cross the wire. */
export interface CallIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

/**
 * A call signal, exactly as it is serialised into the framed plaintext (see §8.1).
 *
 * `sdp` is present on `offer` / `answer` / `restart-*`; `candidates` on `ice`. `fingerprint` is the
 * SHA-256 `a=fingerprint` of the SENDER's DTLS certificate, carried so the receiver can show the SAS
 * before media is even flowing. Unknown fields seen on the wire are ignored on parse.
 */
export interface CallSignal {
  v: number;
  t: CallSignalType;
  callId: string;
  sdp?: string;
  candidates?: CallIceCandidate[];
  fingerprint?: string;
}

/** Fields a caller supplies to {@link frameCallSignal}; `v` is fixed by this build. */
export type CallSignalInput = Omit<CallSignal, 'v'>;

/**
 * The fixed 64-emoji SAS alphabet. IDENTICAL on web, iOS and Android (§8.1) — reordering or editing
 * an entry silently changes every safety code, so this list is frozen and must match the doc exactly.
 */
export const SAS_EMOJI: readonly string[] = [
  '🐶', '🐱', '🦁', '🐴', '🦄', '🐷', '🐘', '🐰', '🐼', '🐓', '🐧', '🐢', '🐟', '🐙', '🦋', '🌷',
  '🌳', '🌵', '🍄', '🌏', '🌙', '☁️', '🔥', '🍌', '🍎', '🍓', '🌽', '🍕', '🎂', '❤️', '😀', '🤖',
  '🎩', '👓', '🔧', '🎅', '👍', '☂️', '⌛', '⏰', '🎁', '💡', '📕', '✏️', '📎', '✂️', '🔒', '🔑',
  '🔨', '☎️', '🏁', '🚂', '🚲', '✈️', '🚀', '🏆', '⚽', '🎸', '🎺', '🔔', '⚓', '🎧', '📁', '📌',
];

/** How many emoji a SAS code shows. Four bytes of SHA-256 → four emoji. */
export const SAS_LENGTH = 4;

/**
 * Frames a call signal into the plaintext that gets sealed by wire v2: the `0x02` byte followed by
 * the signal JSON.
 *
 * Plain `JSON.stringify` (not the wire-v2 canonical JSON) is deliberate, exactly as for attachments:
 * this JSON is never authenticated or compared byte-for-byte — the receiver parses it and reads the
 * fields it knows — so key order is irrelevant and forcing a canonical form would only mislead.
 */
export function frameCallSignal(signal: CallSignalInput): string {
  const framed: CallSignal = { v: CALL_SIGNAL_VERSION, ...signal };
  return String.fromCharCode(CALL_SIGNAL_FRAME_BYTE) + JSON.stringify(framed);
}

/** True when a decrypted plaintext is a call-signal frame rather than chat text or an attachment. */
export function isCallSignalFrame(plaintext: string): boolean {
  // charCodeAt reads the first UTF-16 code unit; U+0002 encodes to the single byte 0x02 under UTF-8,
  // so this matches the byte-level contract without materialising the whole string as bytes.
  return plaintext.charCodeAt(0) === CALL_SIGNAL_FRAME_BYTE;
}

/**
 * Parses a framed call-signal plaintext, validating the version, type and callId.
 *
 * Returns `null` — never throws — for anything that is not a usable signal for the expected call:
 *   - a non-`0x02` frame (chat text / attachment),
 *   - malformed JSON or a wrong/absent version or type,
 *   - a signal whose `callId` does not match `expectedCallId` (a stray signal from another call).
 *
 * Returning `null` rather than throwing is what lets the session drop a mismatched or junk signal
 * quietly, as §8.1 requires ("a receiver drops any signal whose callId doesn't match… and any frame
 * byte other than 0x02").
 */
export function parseCallSignal(plaintext: string, expectedCallId?: string): CallSignal | null {
  if (!isCallSignalFrame(plaintext)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(plaintext.slice(1));
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  if (record.v !== CALL_SIGNAL_VERSION) return null;
  if (typeof record.t !== 'string' || !SIGNAL_TYPES.includes(record.t as CallSignalType)) return null;
  if (typeof record.callId !== 'string' || record.callId.length === 0) return null;
  if (expectedCallId !== undefined && record.callId !== expectedCallId) return null;

  // Copy ONLY known fields so an unknown future field is never trusted or echoed.
  const signal: CallSignal = {
    v: CALL_SIGNAL_VERSION,
    t: record.t as CallSignalType,
    callId: record.callId,
  };
  if (typeof record.sdp === 'string') signal.sdp = record.sdp;
  if (typeof record.fingerprint === 'string') signal.fingerprint = record.fingerprint;
  if (Array.isArray(record.candidates)) {
    signal.candidates = record.candidates
      .filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object')
      .map((c) => {
        const candidate: CallIceCandidate = {
          candidate: typeof c.candidate === 'string' ? c.candidate : '',
        };
        if (typeof c.sdpMid === 'string') candidate.sdpMid = c.sdpMid;
        if (typeof c.sdpMLineIndex === 'number') candidate.sdpMLineIndex = c.sdpMLineIndex;
        return candidate;
      });
  }
  return signal;
}

/**
 * True when an ICE candidate uses a TURN relay. v1 is relay-only (§9.2) for IP privacy, so host and
 * server-reflexive (srflx) and peer-reflexive (prflx) candidates — which would expose the user's real
 * address — are dropped before a candidate is ever sealed or added.
 *
 * The empty-string candidate (the end-of-candidates marker) is NOT a relay candidate, so it is also
 * dropped: a relay-only session never needs to advertise end-of-candidates to the peer.
 */
export function isRelayCandidate(candidate: CallIceCandidate | RTCIceCandidateInit | null): boolean {
  const value = candidate?.candidate;
  if (typeof value !== 'string' || value.length === 0) return false;
  // SDP candidate attribute: "candidate:<foundation> <component> <transport> <priority> <ip> <port>
  // typ <cand-type> …". Match the type token exactly so "relay" never matches inside an address.
  return / typ relay(\s|$)/.test(value);
}

/** Keeps only relay candidates (see {@link isRelayCandidate}). */
export function filterRelayCandidates<T extends CallIceCandidate | RTCIceCandidateInit>(
  candidates: readonly T[]
): T[] {
  return candidates.filter((c) => isRelayCandidate(c));
}

/**
 * Extracts the DTLS certificate fingerprint from an SDP, as the uppercase hex-with-colons string
 * written after `a=fingerprint:sha-256`. This is what the SAS is computed over (§8.1).
 *
 * Returns `null` when the SDP carries no SHA-256 fingerprint line. Only `sha-256` is read: it is what
 * every modern WebRTC stack emits, and mixing hash algorithms into the SAS would make the two sides
 * disagree.
 */
export function extractDtlsFingerprint(sdp: string | null | undefined): string | null {
  if (!sdp) return null;
  const match = /a=fingerprint:sha-256\s+([0-9a-fA-F:]+)/.exec(sdp);
  if (!match) return null;
  return match[1].toUpperCase();
}

/**
 * Computes the 4-emoji Short Authentication String both users compare out loud (§8.1).
 *
 *   sas      = SHA-256( sort([callerFingerprint, calleeFingerprint]).join("|") + "|" + callId )
 *   emoji[i] = SAS_EMOJI[ sas[i] % 64 ]   for i in 0..3
 *
 * The fingerprints are sorted so both sides feed the identical input regardless of who is the caller,
 * and `callId` is mixed in so a captured fingerprint pair cannot be replayed into a different call.
 * A matching code on both screens means no man-in-the-middle rewrote the SDP.
 *
 * Returns `null` if either fingerprint is missing — the UI then shows the code as "computing" rather
 * than a misleading wrong code.
 */
export async function computeSas(
  callerFingerprint: string | null | undefined,
  calleeFingerprint: string | null | undefined,
  callId: string
): Promise<string[] | null> {
  if (!callerFingerprint || !calleeFingerprint || !callId) return null;

  const input = [callerFingerprint, calleeFingerprint].sort().join('|') + '|' + callId;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('The safety code is unavailable: this environment has no Web Crypto API.');
  }
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(input)));
  const emojis: string[] = [];
  for (let i = 0; i < SAS_LENGTH; i += 1) {
    emojis.push(SAS_EMOJI[digest[i] % SAS_EMOJI.length]);
  }
  return emojis;
}
