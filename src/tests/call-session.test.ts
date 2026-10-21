import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CallSession,
  RING_TIMEOUT_MS,
  type CallSessionApi,
  type CallSessionCrypto,
  type CallSessionDeps,
  type CallSessionHandlers,
} from '../lib/call-session';
import { frameCallSignal } from '../lib/call-signal';
import type { Call, CallEvent } from '../api/calls';

/**
 * CallSession behaviour, driven entirely through injected fakes — a fake RTCPeerConnection, a fake
 * CallApi and a fake crypto port. No real WebRTC, so these run under Node. Covers the §8.1 caller and
 * callee flows: happy path, callee accept, answered-elsewhere, busy, the 45 s ring timeout, remote
 * ENDED teardown, and the §11 screen-share request/accept/decline handshake.
 *
 * The fake crypto is deliberately an identity transform (seal = tag the plaintext, open = recover it),
 * so a test can assert WHICH device a signal was sealed to and can hand the session a readable signal
 * without real keys. The real crypto is covered by chat-wire-v2.test.ts and chat-encryption.
 */

const FP_LINE = (fp: string) => `a=fingerprint:sha-256 ${fp}`;
const OFFER_SDP = ['v=0', FP_LINE('AA:BB:CC:DD:EE:FF'), 'a=setup:actpass'].join('\r\n');
const ANSWER_SDP = ['v=0', FP_LINE('11:22:33:44:55:66'), 'a=setup:active'].join('\r\n');

// ── Minimal MediaStream / track fakes (Node has no WebRTC media types) ─────────────────────────────
class FakeTrack {
  enabled = true;
  readonly kind: string;
  onended: (() => void) | null = null;
  stopped = false;
  constructor(kind: string) {
    this.kind = kind;
  }
  stop() {
    this.stopped = true;
  }
}
class FakeMediaStream {
  private readonly tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  addTrack(t: FakeTrack) {
    this.tracks.push(t);
  }
}

class FakeDataChannel {
  readyState: 'connecting' | 'open' | 'closed' = 'open';
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  readonly sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 'closed';
  }
  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

class FakeSender {
  track: FakeTrack | null = null;
  replaceTrack = vi.fn(async (track: FakeTrack | null) => {
    this.track = track;
  });
}

class FakeTransceiver {
  readonly sender = new FakeSender();
  constructor(public readonly label: string) {}
}

let dataChannels: FakeDataChannel[] = [];

class FakePeerConnection {
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  iceGatheringState = 'complete';
  connectionState: RTCPeerConnectionState = 'new';
  configured: RTCConfiguration;
  closed = false;

  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((e: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  readonly transceivers: FakeTransceiver[] = [];
  readonly added: FakeTrack[] = [];
  readonly iceCandidates: RTCIceCandidateInit[] = [];

  constructor(config: RTCConfiguration) {
    this.configured = config;
  }
  async createOffer() {
    return { type: 'offer', sdp: OFFER_SDP };
  }
  async createAnswer() {
    return { type: 'answer', sdp: ANSWER_SDP };
  }
  async setLocalDescription(desc: { type: string; sdp?: string }) {
    this.localDescription = { type: desc.type, sdp: desc.sdp ?? (desc.type === 'offer' ? OFFER_SDP : ANSWER_SDP) };
  }
  async setRemoteDescription(desc: { type: string; sdp: string }) {
    this.remoteDescription = { type: desc.type, sdp: desc.sdp };
  }
  addTrack(track: FakeTrack) {
    this.added.push(track);
    return new FakeSender();
  }
  addTransceiver(trackOrKind: FakeTrack | string, _init?: RTCRtpTransceiverInit) {
    const label = typeof trackOrKind === 'string' ? trackOrKind : trackOrKind.kind;
    const tx = new FakeTransceiver(label);
    this.transceivers.push(tx);
    return tx as unknown as RTCRtpTransceiver;
  }
  createDataChannel(_label: string) {
    const channel = new FakeDataChannel();
    dataChannels.push(channel);
    return channel as unknown as RTCDataChannel;
  }
  async addIceCandidate(c: RTCIceCandidateInit) {
    this.iceCandidates.push(c);
  }
  setConfiguration(c: RTCConfiguration) {
    this.configured = c;
  }
  addEventListener() {}
  removeEventListener() {}
  close() {
    this.closed = true;
  }
  // Test helpers:
  emitConnectionState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

// ── Fakes for api + crypto ─────────────────────────────────────────────────────────────────────────

function makeCall(overrides: Partial<Call>): Call {
  return {
    callId: 'call1',
    matchId: 'match1',
    callerId: 'caller',
    calleeId: 'callee',
    callerDeviceId: 'caller-dev',
    media: 'AUDIO',
    status: 'RINGING',
    createdAt: 1000,
    durationMs: 0,
    ...overrides,
  };
}

function makeApi(overrides: Partial<CallSessionApi> = {}): CallSessionApi {
  return {
    getIceServers: vi.fn(async () => ({ iceServers: [], ttlSeconds: 300, iceTransportPolicy: 'relay' })),
    startCall: vi.fn(async () => makeCall({ status: 'RINGING', callerDeviceId: 'self-dev' })),
    acceptCall: vi.fn(async () => makeCall({ status: 'ACCEPTED' })),
    declineCall: vi.fn(async () => makeCall({ status: 'ENDED', endReason: 'DECLINED' })),
    endCall: vi.fn(async () => makeCall({ status: 'ENDED', endReason: 'HANGUP' })),
    heartbeatCall: vi.fn(async () => makeCall({ status: 'CONNECTED' })),
    relayCallSignal: vi.fn(async () => undefined),
    getCall: vi.fn(async () => makeCall({ status: 'RINGING' })),
    getActiveCall: vi.fn(async () => null),
    ...overrides,
  };
}

const crypto: CallSessionCrypto = {
  callDeviceId: vi.fn(async () => 'self-dev'),
  sealCallSignalToPeer: vi.fn(async (_p, _m, plaintext) => `peer|${plaintext}`),
  sealCallSignalToDevice: vi.fn(async (_p, _m, dev, plaintext) => `dev:${dev}|${plaintext}`),
  // Identity open: strip our test seal tags, otherwise return as-is (events carry raw frames).
  openCallSignal: vi.fn(async (_m, ciphertext: string) => {
    const bar = ciphertext.indexOf('|');
    return bar >= 0 ? ciphertext.slice(bar + 1) : ciphertext;
  }),
};

function makeDeps(api: CallSessionApi, withDisplay = false): CallSessionDeps {
  const deps: CallSessionDeps = {
    api,
    crypto,
    createPeerConnection: (config) => new FakePeerConnection(config) as unknown as RTCPeerConnection,
    getUserMedia: vi.fn(async (constraints) => {
      const tracks = [new FakeTrack('audio')];
      if (constraints.video) tracks.push(new FakeTrack('video'));
      return new FakeMediaStream(tracks) as unknown as MediaStream;
    }),
  };
  if (withDisplay) {
    deps.getDisplayMedia = vi.fn(async () => new FakeMediaStream([new FakeTrack('video')]) as unknown as MediaStream);
  }
  return deps;
}

beforeEach(() => {
  dataChannels = [];
  (globalThis as unknown as { MediaStream: unknown }).MediaStream = FakeMediaStream;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('CallSession — caller happy path', () => {
  it('builds an offer, starts RINGING, and connects on ACCEPTED', async () => {
    const api = makeApi();
    const states: string[] = [];
    const handlers: CallSessionHandlers = { onStateChange: (s) => states.push(s) };
    const session = new CallSession(makeDeps(api), {
      role: 'caller',
      selfUserId: 'caller',
      peerId: 'callee',
      matchId: 'match1',
      media: 'AUDIO',
      handlers,
    });

    await session.start();

    expect(api.startCall).toHaveBeenCalledOnce();
    // The offer was sealed to ALL peer devices (not to a single device).
    expect(crypto.sealCallSignalToPeer).toHaveBeenCalledOnce();
    const offerCiphertext = (api.startCall as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    expect(offerCiphertext.startsWith('peer|')).toBe(true);
    expect(session.getState()).toBe('ringing');

    // Callee answers.
    const answerFrame = frameCallSignal({ t: 'answer', callId: 'call1', sdp: ANSWER_SDP });
    await session.handleEvent({
      kind: 'ACCEPTED',
      callId: 'call1',
      matchId: 'match1',
      userId: 'caller',
      fromDeviceId: 'callee-dev',
      ciphertext: answerFrame,
      at: 2000,
    } as CallEvent);

    expect(session.getState()).toBe('connecting');
    expect(session.getSas()).toHaveLength(4); // both fingerprints known → SAS computed

    // Media comes up.
    const pc = (session as unknown as { pc: FakePeerConnection }).pc;
    pc.emitConnectionState('connected');
    await flush();

    expect(session.getState()).toBe('connected');
    expect(api.heartbeatCall).toHaveBeenCalledWith('call1');
    expect(states).toContain('ringing');
    expect(states).toContain('connected');
  });

  it('ends as BUSY when startCall returns ENDED/BUSY', async () => {
    const api = makeApi({
      startCall: vi.fn(async () => makeCall({ status: 'ENDED', endReason: 'BUSY' })),
    });
    const ended = vi.fn();
    const session = new CallSession(makeDeps(api), {
      role: 'caller',
      selfUserId: 'caller',
      peerId: 'callee',
      matchId: 'match1',
      media: 'AUDIO',
      handlers: { onEnded: ended },
    });

    await session.start();

    expect(session.getState()).toBe('ended');
    expect(ended).toHaveBeenCalledWith('BUSY');
  });

  it('ends the ring as MISSED after 45 s with no answer', async () => {
    vi.useFakeTimers();
    const api = makeApi();
    const ended = vi.fn();
    const session = new CallSession(makeDeps(api), {
      role: 'caller',
      selfUserId: 'caller',
      peerId: 'callee',
      matchId: 'match1',
      media: 'AUDIO',
      handlers: { onEnded: ended },
    });

    await session.start();
    expect(session.getState()).toBe('ringing');

    await vi.advanceTimersByTimeAsync(RING_TIMEOUT_MS + 10);

    expect(api.endCall).toHaveBeenCalledWith('call1', 'MISSED');
    expect(ended).toHaveBeenCalledWith('MISSED');
    expect(session.getState()).toBe('ended');
  });
});

describe('CallSession — callee', () => {
  it('fetches the offer, answers sealed to the caller device, and goes connecting', async () => {
    const api = makeApi({
      getCall: vi.fn(async () =>
        makeCall({
          status: 'RINGING',
          callerDeviceId: 'caller-dev',
          offerCiphertext: frameCallSignal({ t: 'offer', callId: 'call1', sdp: OFFER_SDP }),
        })
      ),
    });
    const session = new CallSession(makeDeps(api), {
      role: 'callee',
      selfUserId: 'callee',
      peerId: 'caller',
      matchId: 'match1',
      media: 'AUDIO',
      callId: 'call1',
      callerDeviceId: 'caller-dev',
    });

    await session.accept();

    expect(api.acceptCall).toHaveBeenCalledOnce();
    const [, deviceId, answerCiphertext] = (api.acceptCall as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(deviceId).toBe('self-dev');
    // The answer was sealed to EXACTLY the caller's device.
    expect(answerCiphertext).toContain('dev:caller-dev|');
    expect(session.getState()).toBe('connecting');
    expect(session.getSas()).toHaveLength(4);
  });

  it('declines a ringing call', async () => {
    const api = makeApi();
    const ended = vi.fn();
    const session = new CallSession(makeDeps(api), {
      role: 'callee',
      selfUserId: 'callee',
      peerId: 'caller',
      matchId: 'match1',
      media: 'AUDIO',
      callId: 'call1',
      handlers: { onEnded: ended },
    });

    await session.decline();

    expect(api.declineCall).toHaveBeenCalledWith('call1');
    expect(ended).toHaveBeenCalledWith('DECLINED');
    expect(session.getState()).toBe('ended');
  });

  it('stops ringing on ANSWERED_ELSEWHERE from another device', async () => {
    const api = makeApi();
    const ended = vi.fn();
    const session = new CallSession(makeDeps(api), {
      role: 'callee',
      selfUserId: 'callee',
      peerId: 'caller',
      matchId: 'match1',
      media: 'AUDIO',
      callId: 'call1',
      handlers: { onEnded: ended },
    });

    await session.handleEvent({
      kind: 'ANSWERED_ELSEWHERE',
      callId: 'call1',
      matchId: 'match1',
      userId: 'callee',
      fromDeviceId: 'other-dev',
      at: 1,
    } as CallEvent);

    expect(ended).toHaveBeenCalledWith('ANSWERED_ELSEWHERE');
    expect(session.getState()).toBe('ended');
  });

  it('ignores ANSWERED_ELSEWHERE from its own accepting device', async () => {
    const api = makeApi({
      getCall: vi.fn(async () =>
        makeCall({
          callerDeviceId: 'caller-dev',
          offerCiphertext: frameCallSignal({ t: 'offer', callId: 'call1', sdp: OFFER_SDP }),
        })
      ),
    });
    const session = new CallSession(makeDeps(api), {
      role: 'callee',
      selfUserId: 'callee',
      peerId: 'caller',
      matchId: 'match1',
      media: 'AUDIO',
      callId: 'call1',
      callerDeviceId: 'caller-dev',
    });

    await session.accept(); // sets selfDeviceId = 'self-dev'
    await session.handleEvent({
      kind: 'ANSWERED_ELSEWHERE',
      callId: 'call1',
      matchId: 'match1',
      userId: 'callee',
      fromDeviceId: 'self-dev',
      at: 1,
    } as CallEvent);

    expect(session.getState()).toBe('connecting'); // not ended
  });
});

describe('CallSession — teardown', () => {
  it('tears down on a remote ENDED event', async () => {
    const api = makeApi();
    const ended = vi.fn();
    const session = new CallSession(makeDeps(api), {
      role: 'caller',
      selfUserId: 'caller',
      peerId: 'callee',
      matchId: 'match1',
      media: 'AUDIO',
      handlers: { onEnded: ended },
    });

    await session.start();
    const pc = (session as unknown as { pc: FakePeerConnection }).pc;

    await session.handleEvent({
      kind: 'ENDED',
      callId: 'call1',
      matchId: 'match1',
      userId: 'caller',
      endReason: 'HANGUP',
      at: 3000,
    } as CallEvent);

    expect(session.getState()).toBe('ended');
    expect(ended).toHaveBeenCalledWith('HANGUP');
    expect(pc.closed).toBe(true);
  });
});

describe('CallSession — screen share (§11)', () => {
  async function connectedCaller(withDisplay: boolean) {
    const api = makeApi();
    const requests: string[] = [];
    const session = new CallSession(makeDeps(api, withDisplay), {
      role: 'caller',
      selfUserId: 'caller',
      peerId: 'callee',
      matchId: 'match1',
      media: 'VIDEO',
      handlers: { onScreenShareRequest: (id) => requests.push(id) },
    });
    await session.start();
    const pc = (session as unknown as { pc: FakePeerConnection }).pc;
    return { session, api, pc, requests, channel: dataChannels[0] };
  }

  it('RECEIVER: surfaces an incoming request and declines it over the control channel', async () => {
    const { session, requests, channel } = await connectedCaller(false);

    channel.emit({ type: 'screen.request', shareId: 'share-1' });
    expect(requests).toEqual(['share-1']);

    session.declineScreenShare('share-1');
    const declined = channel.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'screen.decline');
    expect(declined).toMatchObject({ type: 'screen.decline', shareId: 'share-1' });
  });

  it('RECEIVER: accepting marks the share as receiving', async () => {
    const { session, channel } = await connectedCaller(false);
    channel.emit({ type: 'screen.request', shareId: 'share-2' });
    session.acceptScreenShare('share-2');
    expect(session.getScreenShareState()).toBe('receiving');
    const accept = channel.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'screen.accept');
    expect(accept).toMatchObject({ type: 'screen.accept', shareId: 'share-2' });
  });

  it('SHARER: requests, and on the peer accepting begins sending the display track', async () => {
    const { session, pc, channel } = await connectedCaller(true);

    await session.startScreenShare();
    expect(session.getScreenShareState()).toBe('requesting');
    const request = channel.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'screen.request');
    expect(request?.type).toBe('screen.request');

    channel.emit({ type: 'screen.accept', shareId: request.shareId });
    await flush();

    expect(session.getScreenShareState()).toBe('sending');
    const screenTx = pc.transceivers.find((t) => t.label === 'video' && t.sender.replaceTrack.mock.calls.length > 0);
    expect(screenTx).toBeDefined();
  });

  it('SHARER: a peer decline surfaces an error and resets the state', async () => {
    const { session, channel } = await connectedCaller(true);
    const errors: Error[] = [];
    (session as unknown as { handlers: CallSessionHandlers }).handlers.onError = (e) => errors.push(e);

    await session.startScreenShare();
    const request = channel.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'screen.request');
    channel.emit({ type: 'screen.decline', shareId: request.shareId });

    expect(session.getScreenShareState()).toBe('none');
    expect(errors.some((e) => /declined/i.test(e.message))).toBe(true);
  });
});
