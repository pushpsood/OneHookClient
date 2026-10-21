import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CallApi } from '../api/calls';
import { StateApi } from '../api/state';
import { ProfileApi } from '../api/profile';
import { ChatSettingsApi } from '../api/rest';
import { ChatEncryptionManager } from '../lib/chat-encryption';
import { CallSession, type CallSessionDeps } from '../lib/call-session';
import {
  GlobalCallController,
  type SessionFactoryParams,
  type StartCallArgs,
} from '../lib/call-controller';
import { createWebCaptionPorts, webCaptionsSupported } from '../lib/call-captions-web';
import { friendlyCallError, friendlyEndReason } from '../lib/call-errors';
import { useToast } from '../components/common/Toast';
import { Screen, trackScreenView } from '../lib/analytics/analytics';
import { IncomingCallModal } from '../components/call/IncomingCallModal';
import { InCallScreen } from '../components/call/InCallScreen';

/**
 * App-level call provider. Mounted ONCE for a signed-in user (in {@link AppContent}), it owns the
 * single {@link GlobalCallController} so incoming calls ring on any screen — not only while a
 * conversation is open (OneHookBackend/docs/voice-video-calls.md §10). It renders the ring modal and
 * the in-call surface here, at the app root, and exposes {@link useCall} so a conversation's call
 * buttons start a call through the same controller.
 */
interface CallContextValue {
  /** True while any call is being set up or is live (so conversation buttons disable). */
  active: boolean;
  /** The match a call is currently active for, if any. */
  activeMatchId: string | null;
  /** Start an outbound call from a conversation. */
  startCall(args: StartCallArgs): Promise<void>;
  /** Increments whenever a call ends, so a conversation can refresh its call-history timeline. */
  historyNonce: number;
}

const CallContext = createContext<CallContextValue | null>(null);

/** Access the app-wide call controller. Throws if used outside {@link CallProvider}. */
export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within a CallProvider.');
  return ctx;
}

function buildController(currentUserId: string): GlobalCallController {
  const deviceLanguage =
    (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  const canSendScreen =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  const makeSession = (params: SessionFactoryParams): CallSession | null => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return null;
    const crypto = new ChatEncryptionManager(currentUserId);
    const deps: CallSessionDeps = {
      api: CallApi,
      crypto,
      createPeerConnection: (config) => new RTCPeerConnection(config),
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    };
    if (typeof navigator.mediaDevices.getDisplayMedia === 'function') {
      deps.getDisplayMedia = (constraints) => navigator.mediaDevices.getDisplayMedia(constraints);
    }
    return new CallSession(deps, {
      role: params.role,
      selfUserId: params.selfUserId,
      peerId: params.peerId,
      matchId: params.matchId,
      media: params.media,
      callId: params.callId,
      callerDeviceId: params.callerDeviceId,
      handlers: params.handlers,
    });
  };

  return new GlobalCallController({
    currentUserId,
    subscribeToCallEvents: CallApi.subscribeToCallEvents,
    declineCall: CallApi.declineCall,
    makeSession,
    resolvePeer: async (matchId: string) => {
      const record: any = await StateApi.getMatch(matchId);
      const peerId = record?.userA === currentUserId ? record?.userB : record?.userA;
      let peerName = 'Your Match';
      try {
        if (peerId) {
          const profile: any = await ProfileApi.get(peerId);
          peerName = profile?.displayName || profile?.name || 'Your Match';
        }
      } catch {
        /* best effort — a generic label still rings the call */
      }
      return { peerId: peerId || '', peerName };
    },
    friendlyError: friendlyCallError,
    makeCaptionPorts: () => createWebCaptionPorts(),
    captionsSupported: webCaptionsSupported(),
    getHelpTranslateCaptions: async () => {
      try {
        const settings = await ChatSettingsApi.get();
        return Boolean(settings.helpTranslateCaptions);
      } catch {
        return false;
      }
    },
    deviceLanguage,
    canSendScreen,
  });
}

export function CallProvider({ currentUserId, children }: { currentUserId: string; children: ReactNode }) {
  const { showToast } = useToast();

  const controller = useMemo(() => buildController(currentUserId), [currentUserId]);
  const subscribe = useMemo(() => controller.subscribe.bind(controller), [controller]);
  const getSnapshot = useMemo(() => controller.getSnapshot.bind(controller), [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  // Report a CALL screen_view when the call surface (ring or in-call) first appears.
  const callUiVisible = snapshot.active || Boolean(snapshot.incoming);
  const callUiWasVisible = useRef(false);
  useEffect(() => {
    if (callUiVisible && !callUiWasVisible.current) trackScreenView(Screen.CALL);
    callUiWasVisible.current = callUiVisible;
  }, [callUiVisible]);

  // Surface call errors and non-trivial end reasons (busy, missed, declined…) as toasts.
  useEffect(() => {
    if (snapshot.error) {
      showToast(snapshot.error, 'error');
      controller.clearError();
    }
  }, [snapshot.error, controller, showToast]);

  useEffect(() => {
    if (snapshot.lastEndReason) {
      const note = friendlyEndReason(snapshot.lastEndReason);
      if (note) showToast(note, 'info');
      controller.clearEnded();
    }
  }, [snapshot.lastEndReason, controller, showToast]);

  const value = useMemo<CallContextValue>(
    () => ({
      active: snapshot.active,
      activeMatchId: snapshot.activeMatchId,
      startCall: (args) => controller.startCall(args),
      historyNonce: snapshot.historyNonce,
    }),
    [snapshot.active, snapshot.activeMatchId, snapshot.historyNonce, controller]
  );

  return (
    <CallContext.Provider value={value}>
      {children}

      {/* Incoming-call ring — shows on ANY screen for a signed-in user. */}
      {snapshot.incoming && !snapshot.active && (
        <IncomingCallModal
          peerName={snapshot.incoming.peerName}
          media={snapshot.incoming.media}
          onAcceptVideo={() => void controller.acceptIncoming('VIDEO')}
          onAcceptAudio={() => void controller.acceptIncoming('AUDIO')}
          onDecline={() => void controller.declineIncoming()}
        />
      )}

      {/* In-call surface. */}
      {snapshot.active && (
        <InCallScreen
          peerName={snapshot.peerName}
          media={snapshot.media}
          state={snapshot.state}
          localStream={snapshot.localStream}
          remoteStream={snapshot.remoteStream}
          screenStream={snapshot.screenStream}
          sas={snapshot.sas}
          muted={snapshot.muted}
          cameraOff={snapshot.cameraOff}
          canSendScreen={snapshot.canSendScreen}
          screenShareState={snapshot.screenShareState}
          screenRequest={snapshot.screenRequest}
          captions={snapshot.captions}
          captionsSupported={snapshot.captionsSupported}
          onToggleMute={() => controller.toggleMute()}
          onToggleCamera={() => controller.toggleCamera()}
          onStartScreenShare={() => void controller.startScreenShare()}
          onStopScreenShare={() => controller.stopScreenShare()}
          onAcceptScreenShare={() => controller.acceptScreenShare()}
          onDeclineScreenShare={() => controller.declineScreenShare()}
          onEnableCaptions={() => void controller.enableCaptions()}
          onDisableCaptions={() => controller.disableCaptions()}
          onSelectCaptionLanguage={(lang) => void controller.setCaptionLanguage(lang)}
          onHangup={() => void controller.hangup()}
        />
      )}
    </CallContext.Provider>
  );
}
