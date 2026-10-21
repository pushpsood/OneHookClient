/**
 * GlobalCallController — the ONE, app-wide voice/video call orchestrator
 * (OneHookBackend/docs/voice-video-calls.md). It owns the single `onCallEvent(userId)` subscription
 * and the single live {@link CallSession}, so a call rings on ANY screen, not only while a particular
 * conversation is open (§10, web). Conversation-level call buttons drive it through {@link startCall}.
 *
 * It is framework-agnostic — a plain class with a snapshot + listener surface (like `CallSession`,
 * every dependency is injected) — so it is unit-testable under Node with fakes, and the React
 * `CallProvider` is a thin wrapper over it. Key differences from the old per-conversation hook:
 *   - INCOMING events are NOT filtered by an "open conversation": the modal shows for every match;
 *   - the caller/callee peer identity for an incoming call is resolved lazily via {@link resolvePeer};
 *   - it wires the §12 on-device {@link CaptionSession} onto the call's `control` channel.
 *
 * No SDP / ICE / caption text is ever logged here; captions stay in memory and never reach the
 * backend (§9.1 / D9).
 */

import type {
  Call,
  CallEndReason,
  CallEvent,
  CallMedia,
} from '../api/calls';
import {
  CallSession,
  type CallRole,
  type CallSessionHandlers,
  type CallSessionState,
  type ScreenShareState,
} from './call-session';
import {
  CaptionSession,
  type CaptionEnginePorts,
  type CaptionUiState,
  parseCaptionWire,
} from './call-captions';

/** A pending incoming call shown by the ring modal, with its peer already resolved for the UI. */
export interface IncomingCall {
  callId: string;
  matchId: string;
  media: CallMedia;
  callerDeviceId?: string;
  peerId: string;
  peerName: string;
}

/** What the caller supplies when starting a call from a conversation. */
export interface StartCallArgs {
  matchId: string;
  peerId: string;
  peerName: string;
  media: CallMedia;
}

/** Immutable snapshot the UI renders. */
export interface GlobalCallSnapshot {
  active: boolean;
  state: CallSessionState;
  media: CallMedia;
  activeMatchId: string | null;
  peerName: string;
  incoming: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  sas: string[] | null;
  muted: boolean;
  cameraOff: boolean;
  screenShareState: ScreenShareState;
  screenRequest: string | null;
  canSendScreen: boolean;
  lastEndReason: CallEndReason | null;
  error: string | null;
  /** Bumps whenever a call ends, so a conversation can refresh its call-history timeline. */
  historyNonce: number;
  /** On-device caption / translation state (§12), or null when no call is live. */
  captions: CaptionUiState | null;
  /** Whether this browser can do on-device captions at all (drives the disabled toggle). */
  captionsSupported: boolean;
}

export interface SessionFactoryParams {
  role: CallRole;
  selfUserId: string;
  peerId: string;
  matchId: string;
  media: CallMedia;
  callId?: string;
  callerDeviceId?: string;
  handlers: CallSessionHandlers;
}

export interface GlobalCallControllerDeps {
  currentUserId: string;
  /** Subscribe to the signed-in user's call events and decline a ringing call. */
  subscribeToCallEvents(userId: string, onEvent: (event: CallEvent) => void): () => void;
  declineCall(callId: string): Promise<Call>;
  /** Build a {@link CallSession} wired to the browser's WebRTC + crypto, or null when unavailable. */
  makeSession(params: SessionFactoryParams): CallSession | null;
  /** Resolve the other participant of a match (for an INCOMING call we only have the matchId). */
  resolvePeer(matchId: string): Promise<{ peerId: string; peerName: string }>;
  /** Map a raw error to friendly copy. */
  friendlyError(error: unknown): string;
  /** On-device caption engines for this platform, or null when captions are unsupported. */
  makeCaptionPorts?(): CaptionEnginePorts | null;
  captionsSupported?: boolean;
  /** D13: the local user's "Help translate my captions" setting (enables the sender fallback). */
  getHelpTranslateCaptions?(): Promise<boolean>;
  /** Device language — detection fallback AND default caption target (D12). */
  deviceLanguage?: string;
  canSendScreen?: boolean;
}

type Listener = () => void;

export class GlobalCallController {
  private readonly deps: GlobalCallControllerDeps;
  private readonly listeners = new Set<Listener>();
  private unsubscribe: (() => void) | null = null;

  private session: CallSession | null = null;
  private captionSession: CaptionSession | null = null;
  /** Guards the async peer resolution for an incoming call against races. */
  private incomingToken = 0;

  private snapshot: GlobalCallSnapshot;

  constructor(deps: GlobalCallControllerDeps) {
    this.deps = deps;
    this.snapshot = {
      active: false,
      state: 'idle',
      media: 'AUDIO',
      activeMatchId: null,
      peerName: '',
      incoming: null,
      localStream: null,
      remoteStream: null,
      screenStream: null,
      sas: null,
      muted: false,
      cameraOff: false,
      screenShareState: 'none',
      screenRequest: null,
      canSendScreen: Boolean(deps.canSendScreen),
      lastEndReason: null,
      error: null,
      historyNonce: 0,
      captions: null,
      captionsSupported: Boolean(deps.captionsSupported),
    };
  }

  // ── Store surface ─────────────────────────────────────────────────────────────

  getSnapshot(): GlobalCallSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<GlobalCallSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Begin the single global call-event subscription. Safe to call once per signed-in user. */
  start(): void {
    if (this.unsubscribe || !this.deps.currentUserId) return;
    this.unsubscribe = this.deps.subscribeToCallEvents(this.deps.currentUserId, (event) =>
      this.onCallEvent(event)
    );
  }

  /** Tear down the subscription and any live call. Call on sign-out / unmount. */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    void this.session?.hangup();
    this.session = null;
    this.disposeCaptions();
    this.set({ incoming: null });
  }

  // ── Event routing (GLOBAL — no open-conversation filter) ────────────────────────

  private onCallEvent(event: CallEvent): void {
    if (event.kind === 'INCOMING') {
      // A call rings regardless of which conversation (if any) is open.
      if (this.session) return; // already in / setting up a call → the backend returns BUSY
      void this.presentIncoming(event);
      return;
    }
    const session = this.session;
    if (session && (!session.getCallId() || session.getCallId() === event.callId)) {
      void session.handleEvent(event);
    }
  }

  private async presentIncoming(event: CallEvent): Promise<void> {
    const token = ++this.incomingToken;
    let peerId = '';
    let peerName = 'Your Match';
    try {
      const resolved = await this.deps.resolvePeer(event.matchId);
      peerId = resolved.peerId;
      peerName = resolved.peerName || 'Your Match';
    } catch {
      /* fall back to a generic label; the callee flow still gets callerDeviceId from the Call */
    }
    // Drop if a newer incoming/active call superseded this one while we resolved the peer.
    if (token !== this.incomingToken || this.session) return;
    this.set({
      incoming: {
        callId: event.callId,
        matchId: event.matchId,
        media: event.media ?? 'AUDIO',
        callerDeviceId: event.fromDeviceId ?? undefined,
        peerId,
        peerName,
      },
    });
  }

  // ── Call actions ────────────────────────────────────────────────────────────

  /** Start an outbound call from a conversation. */
  async startCall(args: StartCallArgs): Promise<void> {
    if (this.session || !args.peerId) return;
    const session = this.deps.makeSession({
      role: 'caller',
      selfUserId: this.deps.currentUserId,
      peerId: args.peerId,
      matchId: args.matchId,
      media: args.media,
      handlers: this.buildHandlers(),
    });
    if (!session) {
      this.set({ error: 'Calling is not available in this browser.' });
      return;
    }
    this.session = session;
    this.set({ active: true, media: args.media, activeMatchId: args.matchId, peerName: args.peerName, error: null });
    await session.start();
  }

  /** Accept the ringing incoming call (optionally answering a video call audio-only). */
  async acceptIncoming(media?: CallMedia): Promise<void> {
    const incoming = this.snapshot.incoming;
    if (!incoming || this.session || !incoming.peerId) return;
    const chosen = media ?? incoming.media;
    const session = this.deps.makeSession({
      role: 'callee',
      selfUserId: this.deps.currentUserId,
      peerId: incoming.peerId,
      matchId: incoming.matchId,
      media: chosen,
      callId: incoming.callId,
      callerDeviceId: incoming.callerDeviceId,
      handlers: this.buildHandlers(),
    });
    if (!session) {
      this.set({ error: 'Calling is not available in this browser.' });
      return;
    }
    this.session = session;
    this.set({
      active: true,
      media: chosen,
      activeMatchId: incoming.matchId,
      peerName: incoming.peerName,
      incoming: null,
      error: null,
    });
    await session.accept(chosen);
  }

  /** Decline the ringing incoming call. */
  async declineIncoming(): Promise<void> {
    const incoming = this.snapshot.incoming;
    this.set({ incoming: null });
    if (!incoming) return;
    try {
      await this.deps.declineCall(incoming.callId);
    } catch (error) {
      this.set({ error: this.deps.friendlyError(error) });
    } finally {
      this.set({ historyNonce: this.snapshot.historyNonce + 1 });
    }
  }

  async hangup(): Promise<void> {
    await this.session?.hangup();
  }

  toggleMute(): void {
    this.session?.toggleMute();
  }
  toggleCamera(): void {
    this.session?.toggleCamera();
  }
  async startScreenShare(): Promise<void> {
    try {
      await this.session?.startScreenShare();
    } catch (error) {
      this.set({ error: this.deps.friendlyError(error) });
    }
  }
  stopScreenShare(): void {
    this.session?.stopScreenShare();
  }
  acceptScreenShare(): void {
    const id = this.snapshot.screenRequest;
    if (id) {
      this.session?.acceptScreenShare(id);
      this.set({ screenRequest: null });
    }
  }
  declineScreenShare(): void {
    const id = this.snapshot.screenRequest;
    if (id) {
      this.session?.declineScreenShare(id);
      this.set({ screenRequest: null });
    }
  }

  clearError(): void {
    this.set({ error: null });
  }
  clearEnded(): void {
    this.set({ lastEndReason: null });
  }

  // ── Captions (§12) ────────────────────────────────────────────────────────────

  async enableCaptions(): Promise<void> {
    await this.captionSession?.enableLocalCaptions();
  }
  disableCaptions(): void {
    this.captionSession?.disableLocalCaptions();
  }
  async setCaptionLanguage(lang: string): Promise<void> {
    await this.captionSession?.setTargetLanguage(lang);
  }

  private async initCaptions(): Promise<void> {
    if (this.captionSession || !this.deps.makeCaptionPorts || !this.deps.captionsSupported) return;
    const ports = this.deps.makeCaptionPorts();
    if (!ports) return;
    const helpTranslateCaptions = (await this.deps.getHelpTranslateCaptions?.()) ?? false;
    const session = this.session;
    if (!session) return;
    this.captionSession = new CaptionSession({
      ports,
      send: (message) => session.sendCaptionControlMessage(message),
      onChange: (state) => this.set({ captions: state }),
      deviceLanguage: this.deps.deviceLanguage ?? 'en-US',
      helpTranslateCaptions,
    });
    await this.captionSession.refreshAvailability();
  }

  private disposeCaptions(): void {
    this.captionSession?.dispose();
    this.captionSession = null;
  }

  // ── Session handlers → snapshot ──────────────────────────────────────────────

  private buildHandlers(): CallSessionHandlers {
    return {
      onStateChange: (state) => this.set({ state }),
      onLocalStream: (localStream) => this.set({ localStream }),
      onRemoteStream: (remoteStream) => this.set({ remoteStream }),
      onScreenStream: (screenStream) => this.set({ screenStream }),
      onSasChange: (sas) => this.set({ sas }),
      onScreenShareRequest: (screenRequest) => this.set({ screenRequest }),
      onScreenShareStateChange: (screenShareState) => this.set({ screenShareState }),
      onMuteChange: (muted) => this.set({ muted }),
      onCameraChange: (cameraOff) => this.set({ cameraOff }),
      onControlChannelOpen: () => void this.initCaptions(),
      onCaptionControlMessage: (raw) => {
        const parsed = parseCaptionWire(raw);
        if (parsed) void this.captionSession?.handleWire(parsed);
      },
      onError: (error) => this.set({ error: this.deps.friendlyError(error) }),
      onEnded: (reason) => this.onCallEnded(reason),
    };
  }

  private onCallEnded(reason: CallEndReason | null): void {
    this.disposeCaptions();
    this.session = null;
    this.set({
      lastEndReason: reason,
      active: false,
      state: 'idle',
      activeMatchId: null,
      localStream: null,
      remoteStream: null,
      screenStream: null,
      sas: null,
      muted: false,
      cameraOff: false,
      screenShareState: 'none',
      screenRequest: null,
      captions: null,
      historyNonce: this.snapshot.historyNonce + 1,
    });
  }
}
