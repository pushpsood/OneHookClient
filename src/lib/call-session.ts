/**
 * CallSession — the 1:1 voice/video call state machine that wraps an `RTCPeerConnection` and
 * implements the caller / callee flows of OneHookBackend/docs/voice-video-calls.md §8.1.
 *
 * Responsibilities:
 *   - relay-only ICE (`iceTransportPolicy: "relay"`, plus a second guard that drops any non-relay
 *     candidate before it is sealed or added — §9.2), so neither peer learns the other's IP;
 *   - audio (and camera video) tracks, a PRE-NEGOTIATED `screen` video transceiver and a negotiated
 *     `control` data channel (id 0) built up front, so screen share needs no renegotiation (§6.1);
 *   - ICE batched ~250 ms and relayed, sealed, to the SINGLE peer device handling the call;
 *   - ignoring SIGNAL events not addressed to this device, ANSWERED_ELSEWHERE, the 45 s caller ring
 *     timeout (→ endCall MISSED), a 30 s heartbeat once connected, a 4 min ICE-server refresh + ICE
 *     restart, mute / camera toggles, and the §11 screen-share request/accept handshake over `control`;
 *   - full teardown on ENDED and cold-start recovery via getActiveCall.
 *
 * Every SDP / ICE payload is sealed with the chat E2EE envelope (wire v2 + the `0x02` call frame) by
 * the injected `crypto` port — this session never touches key material and never logs SDP, ICE or
 * ciphertext. All WebRTC and transport dependencies are INJECTED so the whole machine is unit-testable
 * with a fake `RTCPeerConnection` and a fake API.
 */

import {
  computeSas,
  extractDtlsFingerprint,
  filterRelayCandidates,
  frameCallSignal,
  isRelayCandidate,
  parseCallSignal,
  type CallIceCandidate,
} from './call-signal';
import type { Call, CallEndReason, CallEvent, CallMedia, IceServerConfig } from '../api/calls';

export const RING_TIMEOUT_MS = 45_000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const ICE_REFRESH_INTERVAL_MS = 4 * 60_000;
export const ICE_BATCH_MS = 250;
export const SCREEN_ACCEPT_TIMEOUT_MS = 15_000;

/** The call lifecycle as the UI sees it. Distinct from the server `CallStatus`. */
export type CallSessionState =
  | 'idle'
  | 'ringing' // caller: waiting for an answer. callee: ringing for the user to accept.
  | 'connecting' // answered; media is being established.
  | 'connected' // media is up.
  | 'ended';

export type CallRole = 'caller' | 'callee';

/** Who/what is currently on the pre-negotiated screen transceiver. */
export type ScreenShareState = 'none' | 'requesting' | 'sending' | 'receiving';

/** The injected API surface — exactly the subset of `CallApi` this session calls. */
export interface CallSessionApi {
  getIceServers(matchId: string, deviceId: string): Promise<IceServerConfig | null>;
  startCall(
    matchId: string,
    media: CallMedia,
    fromDeviceId: string,
    offerCiphertext: string
  ): Promise<Call>;
  acceptCall(callId: string, deviceId: string, answerCiphertext: string): Promise<Call>;
  declineCall(callId: string): Promise<Call>;
  endCall(callId: string, reason: CallEndReason): Promise<Call>;
  heartbeatCall(callId: string): Promise<Call>;
  relayCallSignal(params: {
    matchId: string;
    callId: string;
    toUserId: string;
    toDeviceId: string;
    fromDeviceId: string;
    ciphertext: string;
  }): Promise<void>;
  getCall(callId: string): Promise<Call | null>;
  getActiveCall(): Promise<Call | null>;
}

/** The injected crypto port — the three call-signal methods added to `ChatEncryptionManager`. */
export interface CallSessionCrypto {
  callDeviceId(): Promise<string>;
  sealCallSignalToPeer(peerId: string, matchId: string, plaintext: string): Promise<string>;
  sealCallSignalToDevice(
    peerId: string,
    matchId: string,
    deviceId: string,
    plaintext: string
  ): Promise<string>;
  openCallSignal(matchId: string, ciphertext: string): Promise<string>;
}

/** Everything the session needs from the outside world, all injectable for tests. */
export interface CallSessionDeps {
  api: CallSessionApi;
  crypto: CallSessionCrypto;
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  /** Optional: absent on mobile web, which can only RECEIVE a screen share. */
  getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
}

/** UI callbacks. All optional; the session never assumes a handler is present. */
export interface CallSessionHandlers {
  onStateChange?(state: CallSessionState): void;
  onLocalStream?(stream: MediaStream): void;
  onRemoteStream?(stream: MediaStream): void;
  onScreenStream?(stream: MediaStream | null): void;
  onSasChange?(emojis: string[] | null): void;
  /** The peer asked to share their screen; the UI must accept or decline (§11.5). */
  onScreenShareRequest?(shareId: string): void;
  onScreenShareStateChange?(state: ScreenShareState): void;
  onMuteChange?(muted: boolean): void;
  onCameraChange?(cameraOff: boolean): void;
  onEnded?(reason: CallEndReason | null): void;
  onError?(error: Error): void;
}

export interface CallSessionParams {
  role: CallRole;
  selfUserId: string;
  peerId: string;
  matchId: string;
  media: CallMedia;
  /** Known up front for the callee (from the INCOMING event / getCall); assigned on start for the caller. */
  callId?: string;
  /** The caller's device id, for the callee to seal its answer to (from the Call record). */
  callerDeviceId?: string;
  handlers?: CallSessionHandlers;
}

/** The control-channel message envelope (§11.3 / §12.3). Unknown types are ignored. */
interface ControlMessage {
  type: string;
  v?: number;
  shareId?: string;
  canSendScreen?: boolean;
  canReceiveScreen?: boolean;
}

const CONTROL_VERSION = 1;

export class CallSession {
  private readonly deps: CallSessionDeps;
  private readonly handlers: CallSessionHandlers;
  readonly role: CallRole;
  readonly selfUserId: string;
  readonly peerId: string;
  readonly matchId: string;
  private media: CallMedia;

  private state: CallSessionState = 'idle';
  private callId: string | null = null;
  private selfDeviceId: string | null = null;
  /** The single peer device this call is bound to (caller's device for the callee, and vice versa). */
  private peerDeviceId: string | null = null;

  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private readonly remoteStream = new MediaStream();
  private screenTransceiver: RTCRtpTransceiver | null = null;
  private cameraTransceiver: RTCRtpTransceiver | null = null;
  private controlChannel: RTCDataChannel | null = null;

  private displayStream: MediaStream | null = null;
  private screenShareState: ScreenShareState = 'none';
  private pendingShareId: string | null = null;
  private screenAcceptTimer: ReturnType<typeof setTimeout> | null = null;

  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private iceRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private iceBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCandidates: CallIceCandidate[] = [];

  private muted = false;
  private cameraOff = false;
  private localFingerprint: string | null = null;
  private remoteFingerprint: string | null = null;
  private sas: string[] | null = null;
  private endReason: CallEndReason | null = null;

  constructor(deps: CallSessionDeps, params: CallSessionParams) {
    this.deps = deps;
    this.handlers = params.handlers ?? {};
    this.role = params.role;
    this.selfUserId = params.selfUserId;
    this.peerId = params.peerId;
    this.matchId = params.matchId;
    this.media = params.media;
    this.callId = params.callId ?? null;
    this.peerDeviceId = params.callerDeviceId ?? null; // set for the callee from the Call record
  }

  // ── Public surface ──────────────────────────────────────────────────────────

  getState(): CallSessionState {
    return this.state;
  }

  getCallId(): string | null {
    return this.callId;
  }

  getSas(): string[] | null {
    return this.sas;
  }

  getRemoteStream(): MediaStream {
    return this.remoteStream;
  }

  isMuted(): boolean {
    return this.muted;
  }

  isCameraOff(): boolean {
    return this.cameraOff;
  }

  canSendScreen(): boolean {
    return typeof this.deps.getDisplayMedia === 'function';
  }

  getScreenShareState(): ScreenShareState {
    return this.screenShareState;
  }

  /** CALLER: build the offer and start the call. Resolves once startCall returns (RINGING or BUSY). */
  async start(): Promise<void> {
    try {
      this.selfDeviceId = await this.deps.crypto.callDeviceId();
      const icePromise = this.deps.api.getIceServers(this.matchId, this.selfDeviceId);
      await this.buildPeerConnection(await icePromise);

      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);
      await this.waitForIceGathering();

      const sdp = this.pc!.localDescription?.sdp ?? offer.sdp ?? '';
      this.localFingerprint = extractDtlsFingerprint(sdp);
      const offerCiphertext = await this.deps.crypto.sealCallSignalToPeer(
        this.peerId,
        this.matchId,
        frameCallSignal({ t: 'offer', callId: this.callId ?? 'pending', sdp, fingerprint: this.localFingerprint ?? undefined })
      );

      const call = await this.deps.api.startCall(
        this.matchId,
        this.media,
        this.selfDeviceId,
        offerCiphertext
      );
      this.callId = call.callId;

      if (call.status === 'ENDED') {
        // The only ENDED startCall result is BUSY (§6.2).
        this.finish(call.endReason ?? 'BUSY');
        return;
      }
      this.setState('ringing');
      this.ringTimer = setTimeout(() => void this.onRingTimeout(), RING_TIMEOUT_MS);
    } catch (error) {
      this.fail(error);
    }
  }

  /** CALLEE: accept an incoming call. `media` lets the callee answer a VIDEO call audio-only. */
  async accept(media?: CallMedia): Promise<void> {
    try {
      if (!this.callId) throw new Error('Cannot accept a call without a callId.');
      if (media) this.media = media;
      this.selfDeviceId = await this.deps.crypto.callDeviceId();

      // Fetch the sealed offer and the caller's device, then ICE servers in parallel.
      const call = await this.deps.api.getCall(this.callId);
      if (!call || call.status === 'ENDED') {
        this.finish(call?.endReason ?? 'CANCELLED');
        return;
      }
      this.peerDeviceId = call.callerDeviceId ?? this.peerDeviceId;
      if (!call.offerCiphertext) throw new Error('The incoming call has no offer to answer.');

      const iceConfig = await this.deps.api.getIceServers(this.matchId, this.selfDeviceId);
      await this.buildPeerConnection(iceConfig);

      const offerPlaintext = await this.deps.crypto.openCallSignal(this.matchId, call.offerCiphertext);
      const offerSignal = parseCallSignal(offerPlaintext, this.callId);
      if (!offerSignal?.sdp) throw new Error('The incoming call offer could not be read.');

      await this.pc!.setRemoteDescription({ type: 'offer', sdp: offerSignal.sdp });
      this.remoteFingerprint = extractDtlsFingerprint(offerSignal.sdp) ?? offerSignal.fingerprint ?? null;

      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      await this.waitForIceGathering();

      const answerSdp = this.pc!.localDescription?.sdp ?? answer.sdp ?? '';
      this.localFingerprint = extractDtlsFingerprint(answerSdp);
      await this.updateSas();

      if (!this.peerDeviceId) throw new Error('The caller device is unknown; cannot answer.');
      const answerCiphertext = await this.deps.crypto.sealCallSignalToDevice(
        this.peerId,
        this.matchId,
        this.peerDeviceId,
        frameCallSignal({ t: 'answer', callId: this.callId, sdp: answerSdp, fingerprint: this.localFingerprint ?? undefined })
      );

      await this.deps.api.acceptCall(this.callId, this.selfDeviceId, answerCiphertext);
      this.setState('connecting');
      this.flushCandidates();
    } catch (error) {
      this.fail(error);
    }
  }

  /** CALLEE: decline a ringing call. */
  async decline(): Promise<void> {
    try {
      if (this.callId) await this.deps.api.declineCall(this.callId);
    } catch (error) {
      this.reportError(error);
    } finally {
      this.finish('DECLINED');
    }
  }

  /** Either side: hang up. The server normalizes the reason by role and state. */
  async hangup(): Promise<void> {
    const wasConnected = this.state === 'connected';
    try {
      if (this.callId) {
        await this.deps.api.endCall(this.callId, wasConnected ? 'HANGUP' : 'CANCELLED');
      }
    } catch (error) {
      this.reportError(error);
    } finally {
      this.finish(wasConnected ? 'HANGUP' : 'CANCELLED');
    }
  }

  /** Route a subscription CallEvent into the session. Events for other calls are ignored. */
  async handleEvent(event: CallEvent): Promise<void> {
    if (this.state === 'ended') return;
    if (this.callId && event.callId !== this.callId) return;

    switch (event.kind) {
      case 'ACCEPTED':
        await this.onAccepted(event);
        break;
      case 'ANSWERED_ELSEWHERE':
        // Another of the callee's devices answered. The accepting device sent it, so it ignores it.
        if (event.fromDeviceId && event.fromDeviceId !== this.selfDeviceId) {
          this.finish('ANSWERED_ELSEWHERE');
        }
        break;
      case 'CONNECTED':
        this.setState('connected');
        this.startHeartbeat();
        break;
      case 'SIGNAL':
        await this.onSignal(event);
        break;
      case 'ENDED':
        this.finish(event.endReason ?? null);
        break;
      default:
        break; // INCOMING is handled by the ring layer, not an active session.
    }
  }

  /** Mute / unmute the microphone. Returns the new muted state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = !this.muted;
    this.handlers.onMuteChange?.(this.muted);
    return this.muted;
  }

  /** Turn the camera on / off. Returns the new cameraOff state. */
  toggleCamera(): boolean {
    this.cameraOff = !this.cameraOff;
    for (const track of this.localStream?.getVideoTracks() ?? []) track.enabled = !this.cameraOff;
    this.handlers.onCameraChange?.(this.cameraOff);
    return this.cameraOff;
  }

  // ── Screen share (§11) ────────────────────────────────────────────────────────

  /** SHARER: request to share. The receiver must accept before any capture starts (§11.5). */
  async startScreenShare(): Promise<void> {
    if (!this.canSendScreen()) throw new Error('Screen sharing is not available on this device.');
    if (this.screenShareState !== 'none') return;
    const shareId = this.randomId();
    this.pendingShareId = shareId;
    this.setScreenShareState('requesting');
    this.sendControl({ type: 'screen.request', shareId });
    this.screenAcceptTimer = setTimeout(() => {
      if (this.screenShareState === 'requesting') {
        this.pendingShareId = null;
        this.setScreenShareState('none');
        this.reportError(new Error('Your match did not respond to the screen-share request.'));
      }
    }, SCREEN_ACCEPT_TIMEOUT_MS);
  }

  /** SHARER or RECEIVER: stop the active share from this side. */
  stopScreenShare(): void {
    if (this.screenShareState === 'sending') {
      this.replaceScreenTrack(null);
      for (const track of this.displayStream?.getTracks() ?? []) track.stop();
      this.displayStream = null;
      this.sendControl({ type: 'screen.stopped' });
    } else if (this.screenShareState === 'receiving') {
      // Ask the sender to stop; they own the capture (§11.5 "Stop viewing").
      this.sendControl({ type: 'screen.stop-request' });
    }
    this.setScreenShareState('none');
  }

  /** RECEIVER: accept an incoming screen-share request. */
  acceptScreenShare(shareId: string): void {
    this.sendControl({ type: 'screen.accept', shareId });
    this.setScreenShareState('receiving');
  }

  /** RECEIVER: decline an incoming screen-share request (§11.5). */
  declineScreenShare(shareId: string): void {
    this.sendControl({ type: 'screen.decline', shareId });
  }

  // ── Caller: ACCEPTED / SIGNAL handling ──────────────────────────────────────

  private async onAccepted(event: CallEvent): Promise<void> {
    if (this.role !== 'caller' || !this.pc) return;
    this.clearRingTimer();
    this.peerDeviceId = event.fromDeviceId ?? this.peerDeviceId;
    if (!event.ciphertext) {
      this.fail(new Error('The answer was missing from the accept event.'));
      return;
    }
    try {
      const answerPlaintext = await this.deps.crypto.openCallSignal(this.matchId, event.ciphertext);
      const answerSignal = parseCallSignal(answerPlaintext, this.callId ?? undefined);
      if (!answerSignal?.sdp) throw new Error('The answer could not be read.');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSignal.sdp });
      this.remoteFingerprint =
        extractDtlsFingerprint(answerSignal.sdp) ?? answerSignal.fingerprint ?? null;
      await this.updateSas();
      this.setState('connecting');
      this.flushCandidates();
    } catch (error) {
      this.fail(error);
    }
  }

  private async onSignal(event: CallEvent): Promise<void> {
    // Ignore signals addressed to another of our devices (§8.1).
    if (!this.pc || !event.ciphertext) return;
    if (event.toDeviceId && event.toDeviceId !== this.selfDeviceId) return;
    try {
      const plaintext = await this.deps.crypto.openCallSignal(this.matchId, event.ciphertext);
      const signal = parseCallSignal(plaintext, this.callId ?? undefined);
      if (!signal) return;

      if (signal.t === 'ice' && signal.candidates) {
        for (const candidate of filterRelayCandidates(signal.candidates)) {
          await this.pc.addIceCandidate(candidate as RTCIceCandidateInit);
        }
      } else if (signal.t === 'restart-offer' && signal.sdp) {
        await this.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.sendSignalToPeerDevice({ t: 'restart-answer', sdp: answer.sdp ?? '' });
      } else if (signal.t === 'restart-answer' && signal.sdp) {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      }
    } catch (error) {
      this.reportError(error);
    }
  }

  // ── Peer connection construction ────────────────────────────────────────────

  private async buildPeerConnection(iceConfig: IceServerConfig | null): Promise<void> {
    const pc = this.deps.createPeerConnection(this.rtcConfig(iceConfig));
    this.pc = pc;

    this.localStream = await this.deps.getUserMedia({
      audio: true,
      video: this.media === 'VIDEO',
    });
    for (const track of this.localStream.getAudioTracks()) pc.addTrack(track, this.localStream);
    if (this.media === 'VIDEO') {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        this.cameraTransceiver = pc.addTransceiver(videoTrack, { direction: 'sendrecv' });
      }
    }
    // Pre-negotiated screen transceiver: a later share is a replaceTrack(), never a renegotiation.
    this.screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    // Negotiated control channel (id 0): screen-share handshake + the future captions hook (§12).
    this.controlChannel = pc.createDataChannel('control', { negotiated: true, id: 0, ordered: true });
    this.wireControlChannel(this.controlChannel);

    pc.onicecandidate = (e) => this.onLocalCandidate(e.candidate);
    pc.ontrack = (e) => this.onRemoteTrack(e);
    pc.onconnectionstatechange = () => this.onConnectionStateChange();

    this.handlers.onLocalStream?.(this.localStream);
    this.handlers.onRemoteStream?.(this.remoteStream);
    this.startIceRefresh();
  }

  private rtcConfig(iceConfig: IceServerConfig | null): RTCConfiguration {
    return {
      iceServers: (iceConfig?.iceServers ?? []).map((server) => ({
        urls: server.urls,
        username: server.username ?? undefined,
        credential: server.credential ?? undefined,
      })),
      // Relay-only: the privacy guarantee. The server returns "relay"; we also hard-default to it.
      iceTransportPolicy: (iceConfig?.iceTransportPolicy as RTCIceTransportPolicy) ?? 'relay',
    };
  }

  private onLocalCandidate(candidate: RTCIceCandidate | null): void {
    if (!candidate || !candidate.candidate) return;
    // Second guard behind iceTransportPolicy: never leak a host/srflx candidate (§9.2).
    if (!isRelayCandidate({ candidate: candidate.candidate })) return;
    // Only trickle once the single peer device is known; pre-answer candidates ride in the offer SDP.
    if (!this.peerDeviceId) return;
    this.pendingCandidates.push({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
    });
    if (!this.iceBatchTimer) {
      this.iceBatchTimer = setTimeout(() => void this.flushCandidates(), ICE_BATCH_MS);
    }
  }

  private async flushCandidates(): Promise<void> {
    if (this.iceBatchTimer) {
      clearTimeout(this.iceBatchTimer);
      this.iceBatchTimer = null;
    }
    if (!this.pendingCandidates.length || !this.peerDeviceId) return;
    const candidates = this.pendingCandidates;
    this.pendingCandidates = [];
    try {
      await this.sendSignalToPeerDevice({ t: 'ice', candidates });
    } catch (error) {
      this.reportError(error);
    }
  }

  private onRemoteTrack(event: RTCTrackEvent): void {
    const track = event.track;
    // The pre-negotiated screen transceiver carries the peer's shared screen; everything else is
    // the camera / mic the UI renders as the remote participant.
    if (this.screenTransceiver && event.transceiver === this.screenTransceiver) {
      const stream = new MediaStream([track]);
      this.displayStream = stream;
      this.handlers.onScreenStream?.(stream);
      track.onended = () => {
        this.handlers.onScreenStream?.(null);
        if (this.screenShareState === 'receiving') this.setScreenShareState('none');
      };
      return;
    }
    this.remoteStream.addTrack(track);
    this.handlers.onRemoteStream?.(this.remoteStream);
  }

  private onConnectionStateChange(): void {
    const state = this.pc?.connectionState;
    if (state === 'connected') {
      if (this.state !== 'connected') this.setState('connected');
      this.startHeartbeat();
    } else if (state === 'failed') {
      void this.restartIce();
    }
  }

  // ── Control channel (screen share + captions hook) ──────────────────────────

  private wireControlChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.sendControl({
        type: 'capabilities',
        v: CONTROL_VERSION,
        canSendScreen: this.canSendScreen(),
        canReceiveScreen: true,
      });
    };
    channel.onmessage = (event) => this.onControlMessage(event.data);
  }

  private onControlMessage(data: unknown): void {
    let message: ControlMessage;
    try {
      message = JSON.parse(typeof data === 'string' ? data : '') as ControlMessage;
    } catch {
      return; // Unknown / non-JSON control payloads are ignored (forward-compatibility).
    }
    switch (message.type) {
      case 'capabilities':
        break; // capability info; the UI reads canSendScreen() locally for now.
      case 'screen.request':
        if (message.shareId) {
          this.pendingShareId = message.shareId;
          this.handlers.onScreenShareRequest?.(message.shareId);
        }
        break;
      case 'screen.accept':
        if (message.shareId && message.shareId === this.pendingShareId) void this.beginSendingScreen();
        break;
      case 'screen.decline':
        if (message.shareId && message.shareId === this.pendingShareId) {
          this.clearScreenAcceptTimer();
          this.pendingShareId = null;
          this.setScreenShareState('none');
          this.reportError(new Error('Your match declined the screen share.'));
        }
        break;
      case 'screen.stopped':
        this.handlers.onScreenStream?.(null);
        if (this.screenShareState === 'receiving') this.setScreenShareState('none');
        break;
      case 'screen.stop-request':
        if (this.screenShareState === 'sending') this.stopScreenShare();
        break;
      // TODO(captions): §12 live captions / translation ride this same `control` channel
      // (message types `caption`, `caption.state`, `translate.request`, `translate.response`).
      // Out of scope for this pass; wire the handlers here when captions land. On-device only —
      // caption/translation text must NEVER be sent to any cloud service.
      default:
        break;
    }
  }

  private async beginSendingScreen(): Promise<void> {
    this.clearScreenAcceptTimer();
    if (!this.deps.getDisplayMedia) return;
    try {
      const stream = await this.deps.getDisplayMedia({ video: true, audio: false });
      this.displayStream = stream;
      const [screenTrack] = stream.getVideoTracks();
      if (!screenTrack) throw new Error('No screen track was captured.');
      screenTrack.onended = () => this.stopScreenShare();
      this.replaceScreenTrack(screenTrack);
      this.setScreenShareState('sending');
    } catch (error) {
      this.pendingShareId = null;
      this.setScreenShareState('none');
      this.reportError(error);
    }
  }

  private replaceScreenTrack(track: MediaStreamTrack | null): void {
    void this.screenTransceiver?.sender.replaceTrack(track);
  }

  private sendControl(message: ControlMessage): void {
    if (this.controlChannel && this.controlChannel.readyState === 'open') {
      this.controlChannel.send(JSON.stringify(message));
    }
  }

  // ── ICE restart / refresh ────────────────────────────────────────────────────

  private startIceRefresh(): void {
    if (this.iceRefreshTimer) return;
    this.iceRefreshTimer = setInterval(() => void this.restartIce(), ICE_REFRESH_INTERVAL_MS);
  }

  private async restartIce(): Promise<void> {
    if (!this.pc || this.role !== 'caller' || this.state === 'ended' || !this.selfDeviceId) return;
    try {
      const iceConfig = await this.deps.api.getIceServers(this.matchId, this.selfDeviceId);
      if (iceConfig) this.pc.setConfiguration(this.rtcConfig(iceConfig));
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      await this.sendSignalToPeerDevice({ t: 'restart-offer', sdp: offer.sdp ?? '' });
    } catch (error) {
      this.reportError(error);
    }
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.heartbeatTimer || !this.callId) return;
    void this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.callId) return;
    try {
      const call = await this.deps.api.heartbeatCall(this.callId);
      if (call.status === 'ENDED') this.finish(call.endReason ?? null);
    } catch (error) {
      this.reportError(error);
    }
  }

  // ── Signalling helpers ─────────────────────────────────────────────────────────

  private async sendSignalToPeerDevice(signal: {
    t: 'ice' | 'restart-offer' | 'restart-answer';
    sdp?: string;
    candidates?: CallIceCandidate[];
  }): Promise<void> {
    if (!this.callId || !this.peerDeviceId || !this.selfDeviceId) return;
    const ciphertext = await this.deps.crypto.sealCallSignalToDevice(
      this.peerId,
      this.matchId,
      this.peerDeviceId,
      frameCallSignal({ ...signal, callId: this.callId })
    );
    await this.deps.api.relayCallSignal({
      matchId: this.matchId,
      callId: this.callId,
      toUserId: this.peerId,
      toDeviceId: this.peerDeviceId,
      fromDeviceId: this.selfDeviceId,
      ciphertext,
    });
  }

  private waitForIceGathering(): Promise<void> {
    const pc = this.pc;
    if (!pc || pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        pc.removeEventListener?.('icegatheringstatechange', check);
        resolve();
      };
      const check = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      // Gather for up to ~1 s, then send whatever relay candidates we have (§6.1).
      const timer = setTimeout(done, 1_000);
      pc.addEventListener?.('icegatheringstatechange', check);
    });
  }

  private async updateSas(): Promise<void> {
    if (!this.localFingerprint || !this.remoteFingerprint || !this.callId) return;
    const callerFp = this.role === 'caller' ? this.localFingerprint : this.remoteFingerprint;
    const calleeFp = this.role === 'caller' ? this.remoteFingerprint : this.localFingerprint;
    try {
      this.sas = await computeSas(callerFp, calleeFp, this.callId);
      this.handlers.onSasChange?.(this.sas);
    } catch (error) {
      this.reportError(error);
    }
  }

  private async onRingTimeout(): Promise<void> {
    if (this.state !== 'ringing' || !this.callId) return;
    try {
      await this.deps.api.endCall(this.callId, 'MISSED');
    } catch (error) {
      this.reportError(error);
    } finally {
      this.finish('MISSED');
    }
  }

  // ── State + teardown ──────────────────────────────────────────────────────────

  private setState(state: CallSessionState): void {
    if (this.state === state || this.state === 'ended') return;
    this.state = state;
    this.handlers.onStateChange?.(state);
  }

  private setScreenShareState(state: ScreenShareState): void {
    if (this.screenShareState === state) return;
    this.screenShareState = state;
    this.handlers.onScreenShareStateChange?.(state);
  }

  private fail(error: unknown): void {
    this.reportError(error);
    this.finish('FAILED');
  }

  private reportError(error: unknown): void {
    this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  /** Tear everything down exactly once. Safe to call from any path (ENDED event, hangup, error). */
  private finish(reason: CallEndReason | null): void {
    if (this.state === 'ended') return;
    this.endReason = reason;
    this.state = 'ended';

    this.clearRingTimer();
    this.clearScreenAcceptTimer();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.iceRefreshTimer) clearInterval(this.iceRefreshTimer);
    if (this.iceBatchTimer) clearTimeout(this.iceBatchTimer);
    this.heartbeatTimer = this.iceRefreshTimer = this.iceBatchTimer = null;

    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    for (const track of this.displayStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
    this.displayStream = null;

    try {
      this.controlChannel?.close();
    } catch {
      /* already closing */
    }
    try {
      this.pc?.close();
    } catch {
      /* already closed */
    }
    this.pc = null;

    this.handlers.onStateChange?.('ended');
    this.handlers.onEnded?.(reason);
  }

  private clearRingTimer(): void {
    if (this.ringTimer) {
      clearTimeout(this.ringTimer);
      this.ringTimer = null;
    }
  }

  private clearScreenAcceptTimer(): void {
    if (this.screenAcceptTimer) {
      clearTimeout(this.screenAcceptTimer);
      this.screenAcceptTimer = null;
    }
  }

  private randomId(): string {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

/** Cold-start recovery (§8.1): returns the user's live call after an app restart, or null. */
export async function recoverActiveCall(api: Pick<CallSessionApi, 'getActiveCall'>): Promise<Call | null> {
  return api.getActiveCall();
}
