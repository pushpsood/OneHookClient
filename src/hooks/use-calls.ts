import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CallApi, type Call, type CallEndReason, type CallEvent, type CallMedia } from '../api/calls';
import {
  CallEligibilityTracker,
  callLockMessage,
  DEFAULT_ELIGIBILITY,
  type CallEligibilityState,
} from '../lib/call-eligibility';
import { ChatEncryptionManager } from '../lib/chat-encryption';
import {
  CallSession,
  type CallSessionDeps,
  type CallSessionHandlers,
  type CallSessionState,
  type ScreenShareState,
} from '../lib/call-session';
import { friendlyCallError } from '../lib/call-errors';

/** A pending incoming call shown by the ring modal before the user accepts or declines. */
export interface IncomingCall {
  callId: string;
  media: CallMedia;
  callerDeviceId?: string;
}

export interface CallController {
  /** True while a call is being set up or is live (ringing out, connecting, connected). */
  active: boolean;
  state: CallSessionState;
  media: CallMedia;
  incoming: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  sas: string[] | null;
  muted: boolean;
  cameraOff: boolean;
  screenShareState: ScreenShareState;
  /** A peer screen-share request awaiting the local user's accept/decline (§11.5). */
  screenRequest: string | null;
  canSendScreen: boolean;
  /** The last call's end reason, for a one-shot toast. Cleared after reading via {@link clearEnded}. */
  lastEndReason: CallEndReason | null;
  /** Transient user-facing error copy (mapped via friendlyCallError). */
  error: string | null;
  /** Server call rows for this match, newest first, for the conversation timeline. */
  history: Call[];
  startCall(media: CallMedia): Promise<void>;
  acceptIncoming(media?: CallMedia): Promise<void>;
  declineIncoming(): Promise<void>;
  hangup(): Promise<void>;
  toggleMute(): void;
  toggleCamera(): void;
  startScreenShare(): Promise<void>;
  stopScreenShare(): void;
  acceptScreenShare(): void;
  declineScreenShare(): void;
  clearError(): void;
  clearEnded(): void;
}

/**
 * Manages voice/video calls for ONE open conversation: subscribes to `onCallEvent(userId)`, filters
 * to this match, drives a {@link CallSession}, and surfaces everything the call UI needs as React
 * state. Scoped to the open conversation (web rings only while a tab holds the socket, per §10).
 *
 * The browser WebRTC primitives are the only non-injected part here; the session itself takes them as
 * dependencies so it stays unit-testable (see call-session.test.ts).
 */
export function useCallController(params: {
  currentUserId: string;
  matchId: string;
  peerId?: string;
  peerName: string;
}): CallController {
  const { currentUserId, matchId, peerId, peerName } = params;

  const [active, setActive] = useState(false);
  const [state, setState] = useState<CallSessionState>('idle');
  const [media, setMedia] = useState<CallMedia>('AUDIO');
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sas, setSas] = useState<string[] | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenShareState, setScreenShareState] = useState<ScreenShareState>('none');
  const [screenRequest, setScreenRequest] = useState<string | null>(null);
  const [lastEndReason, setLastEndReason] = useState<CallEndReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Call[]>([]);

  const sessionRef = useRef<CallSession | null>(null);

  const encryptionManager = useMemo(
    () => (currentUserId ? new ChatEncryptionManager(currentUserId) : null),
    [currentUserId]
  );

  const canSendScreen =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  const refreshHistory = useCallback(() => {
    if (!matchId) return;
    CallApi.getCallHistory(matchId)
      .then(setHistory)
      .catch(() => undefined); // best effort: a missing history must never break the conversation
  }, [matchId]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const resetCallState = useCallback(() => {
    sessionRef.current = null;
    setActive(false);
    setState('idle');
    setLocalStream(null);
    setRemoteStream(null);
    setScreenStream(null);
    setSas(null);
    setMuted(false);
    setCameraOff(false);
    setScreenShareState('none');
    setScreenRequest(null);
  }, []);

  const handlers: CallSessionHandlers = useMemo(
    () => ({
      onStateChange: setState,
      onLocalStream: setLocalStream,
      onRemoteStream: (s) => setRemoteStream(s),
      onScreenStream: setScreenStream,
      onSasChange: setSas,
      onScreenShareRequest: (id) => setScreenRequest(id),
      onScreenShareStateChange: setScreenShareState,
      onMuteChange: setMuted,
      onCameraChange: setCameraOff,
      onError: (e) => setError(friendlyCallError(e)),
      onEnded: (reason) => {
        setLastEndReason(reason);
        resetCallState();
        refreshHistory();
      },
    }),
    [resetCallState, refreshHistory]
  );

  const makeDeps = useCallback((): CallSessionDeps | null => {
    if (!encryptionManager || typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return null;
    }
    const deps: CallSessionDeps = {
      api: CallApi,
      crypto: encryptionManager,
      createPeerConnection: (config) => new RTCPeerConnection(config),
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    };
    if (typeof navigator.mediaDevices.getDisplayMedia === 'function') {
      deps.getDisplayMedia = (constraints) => navigator.mediaDevices.getDisplayMedia(constraints);
    }
    return deps;
  }, [encryptionManager]);

  const startCall = useCallback(
    async (callMedia: CallMedia) => {
      if (sessionRef.current || !peerId) return;
      const deps = makeDeps();
      if (!deps) {
        setError('Calling is not available in this browser.');
        return;
      }
      setError(null);
      setMedia(callMedia);
      const session = new CallSession(deps, {
        role: 'caller',
        selfUserId: currentUserId,
        peerId,
        matchId,
        media: callMedia,
        handlers,
      });
      sessionRef.current = session;
      setActive(true);
      await session.start();
    },
    [makeDeps, peerId, currentUserId, matchId, handlers]
  );

  const acceptIncoming = useCallback(
    async (callMedia?: CallMedia) => {
      if (!incoming || sessionRef.current || !peerId) return;
      const deps = makeDeps();
      if (!deps) {
        setError('Calling is not available in this browser.');
        return;
      }
      const chosen = callMedia ?? incoming.media;
      setError(null);
      setMedia(chosen);
      const session = new CallSession(deps, {
        role: 'callee',
        selfUserId: currentUserId,
        peerId,
        matchId,
        media: chosen,
        callId: incoming.callId,
        callerDeviceId: incoming.callerDeviceId,
        handlers,
      });
      sessionRef.current = session;
      setActive(true);
      setIncoming(null);
      await session.accept(chosen);
    },
    [incoming, makeDeps, peerId, currentUserId, matchId, handlers]
  );

  const declineIncoming = useCallback(async () => {
    const pending = incoming;
    setIncoming(null);
    if (!pending) return;
    try {
      await CallApi.declineCall(pending.callId);
    } catch (e) {
      setError(friendlyCallError(e));
    } finally {
      refreshHistory();
    }
  }, [incoming, refreshHistory]);

  const hangup = useCallback(async () => {
    await sessionRef.current?.hangup();
  }, []);

  const toggleMute = useCallback(() => sessionRef.current?.toggleMute(), []);
  const toggleCamera = useCallback(() => sessionRef.current?.toggleCamera(), []);
  const startScreenShare = useCallback(async () => {
    try {
      await sessionRef.current?.startScreenShare();
    } catch (e) {
      setError(friendlyCallError(e));
    }
  }, []);
  const stopScreenShare = useCallback(() => sessionRef.current?.stopScreenShare(), []);
  const acceptScreenShare = useCallback(() => {
    if (screenRequest) {
      sessionRef.current?.acceptScreenShare(screenRequest);
      setScreenRequest(null);
    }
  }, [screenRequest]);
  const declineScreenShare = useCallback(() => {
    if (screenRequest) {
      sessionRef.current?.declineScreenShare(screenRequest);
      setScreenRequest(null);
    }
  }, [screenRequest]);

  const clearError = useCallback(() => setError(null), []);
  const clearEnded = useCallback(() => setLastEndReason(null), []);

  // Subscribe to this user's call events, scoped to the open conversation.
  useEffect(() => {
    if (!currentUserId) return;
    const unsubscribe = CallApi.subscribeToCallEvents(currentUserId, (event: CallEvent) => {
      if (event.kind === 'INCOMING') {
        if (event.matchId !== matchId) return; // only ring for the conversation that is open
        if (sessionRef.current) return; // already in / setting up a call → the backend returns BUSY
        setIncoming({
          callId: event.callId,
          media: event.media ?? 'AUDIO',
          callerDeviceId: event.fromDeviceId ?? undefined,
        });
        return;
      }
      const session = sessionRef.current;
      if (session && (!session.getCallId() || session.getCallId() === event.callId)) {
        void session.handleEvent(event);
      }
    });
    return () => unsubscribe();
  }, [currentUserId, matchId]);

  // Clear a stale incoming prompt (and tear down any call) when the conversation changes / unmounts.
  useEffect(() => {
    return () => {
      void sessionRef.current?.hangup();
      sessionRef.current = null;
      setIncoming(null);
    };
  }, [matchId]);

  // `peerName` is part of the public contract (the UI labels the modal with it) but not used here.
  void peerName;

  return {
    active,
    state,
    media,
    incoming,
    localStream,
    remoteStream,
    screenStream,
    sas,
    muted,
    cameraOff,
    screenShareState,
    screenRequest,
    canSendScreen,
    lastEndReason,
    error,
    history,
    startCall,
    acceptIncoming,
    declineIncoming,
    hangup,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    acceptScreenShare,
    declineScreenShare,
    clearError,
    clearEnded,
  };
}

/** What the call buttons need to render and police the "message first" lock. */
export interface CallEligibilityController {
  /** True while the server says calling is not yet allowed for this match. */
  locked: boolean;
  /** User-facing explanation for the lock (server copy, else the product fallback). */
  lockMessage: string;
  /** Machine reason (e.g. `MESSAGE_FIRST`), or null. */
  reason: string | null;
  /** Ask for a throttled re-check (after the user sends / a peer message arrives). */
  recheck(): void;
}

/**
 * Tracks whether calling is unlocked for ONE open conversation. Fetches on open, re-checks (throttled)
 * on demand, stops once unlocked, and fails open on any error — the server still enforces the rule in
 * `startCall`. `enabled` is false for surfaces with no real peer (e.g. Mr.OneHook), where it stays
 * unlocked and makes no requests.
 */
export function useCallEligibility(matchId: string, enabled: boolean): CallEligibilityController {
  const [state, setState] = useState<CallEligibilityState>(DEFAULT_ELIGIBILITY);
  const trackerRef = useRef<CallEligibilityTracker | null>(null);

  useEffect(() => {
    if (!enabled || !matchId) {
      trackerRef.current = null;
      setState(DEFAULT_ELIGIBILITY);
      return;
    }
    setState(DEFAULT_ELIGIBILITY);
    const tracker = new CallEligibilityTracker({
      matchId,
      getEligibility: (id) => CallApi.getCallEligibility(id),
      onChange: setState,
    });
    trackerRef.current = tracker;
    tracker.start();
    return () => {
      tracker.dispose();
      trackerRef.current = null;
    };
  }, [matchId, enabled]);

  const recheck = useCallback(() => trackerRef.current?.recheck(), []);

  return {
    locked: !state.allowed,
    lockMessage: callLockMessage(state),
    reason: state.reason,
    recheck,
  };
}
