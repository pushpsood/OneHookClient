import { describe, expect, it, vi } from 'vitest';
import {
  GlobalCallController,
  type GlobalCallControllerDeps,
  type SessionFactoryParams,
} from '../lib/call-controller';
import type { Call, CallEvent } from '../api/calls';

/**
 * Tests for the ONE app-level call orchestrator (OneHookBackend/docs/voice-video-calls.md §10).
 *
 * The defining behaviour of the global controller (vs. the old per-conversation hook) is that an
 * INCOMING call rings on ANY screen — it is NEVER filtered by which conversation (if any) is open.
 * These run under Node with injected fakes; no DOM, WebRTC or AppSync is touched.
 */

/** Flush the async peer-resolution microtask(s) in presentIncoming. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A minimal stand-in for the WebRTC CallSession the controller drives. */
class FakeSession {
  readonly role: string;
  readonly matchId: string;
  callId: string | null;
  started = false;
  accepted: string | null = null;
  hungUp = false;
  constructor(params: SessionFactoryParams) {
    this.role = params.role;
    this.matchId = params.matchId;
    this.callId = params.callId ?? null;
  }
  async start(): Promise<void> {
    this.started = true;
  }
  async accept(media: string): Promise<void> {
    this.accepted = media;
  }
  async hangup(): Promise<void> {
    this.hungUp = true;
  }
  getCallId(): string | null {
    return this.callId;
  }
  async handleEvent(): Promise<void> {}
  toggleMute(): void {}
  toggleCamera(): void {}
  async startScreenShare(): Promise<void> {}
  stopScreenShare(): void {}
  acceptScreenShare(): void {}
  declineScreenShare(): void {}
  sendCaptionControlMessage(): void {}
}

const incomingEvent = (overrides: Partial<CallEvent> = {}): CallEvent => ({
  userId: 'me',
  callId: 'call-1',
  matchId: 'match-1',
  kind: 'INCOMING',
  media: 'VIDEO',
  fromDeviceId: 'caller-device',
  at: 1,
  ...overrides,
});

function harness(overrides: Partial<GlobalCallControllerDeps> = {}) {
  let emit: (event: CallEvent) => void = () => {};
  const sessions: FakeSession[] = [];
  const declineCall = vi.fn(async () => ({ callId: 'call-1' }) as Call);
  const deps: GlobalCallControllerDeps = {
    currentUserId: 'me',
    subscribeToCallEvents: (_userId, onEvent) => {
      emit = onEvent;
      return () => {};
    },
    declineCall,
    makeSession: (params) => {
      const session = new FakeSession(params);
      sessions.push(session);
      // The controller only needs the subset above; cast through unknown for the test.
      return session as unknown as ReturnType<GlobalCallControllerDeps['makeSession']>;
    },
    resolvePeer: async () => ({ peerId: 'peer-user', peerName: 'Alex' }),
    friendlyError: (error) => String(error),
    ...overrides,
  };
  const controller = new GlobalCallController(deps);
  controller.start();
  return { controller, sessions, declineCall, emit: (e: CallEvent) => emit(e) };
}

describe('GlobalCallController — app-wide ringing (§10)', () => {
  it('presents an INCOMING call as a ring modal with NO conversation open', async () => {
    const { controller, emit } = harness();

    emit(incomingEvent());
    await flush();

    const snap = controller.getSnapshot();
    expect(snap.incoming).toMatchObject({
      callId: 'call-1',
      matchId: 'match-1',
      media: 'VIDEO',
      peerId: 'peer-user',
      peerName: 'Alex',
      callerDeviceId: 'caller-device',
    });
    // The modal is up but no call is active yet.
    expect(snap.active).toBe(false);
  });

  it('rings for ANY match — it is never filtered by an open conversation', async () => {
    const { controller, emit } = harness();

    // A call for a match the user is not currently "looking at" still rings.
    emit(incomingEvent({ callId: 'c-x', matchId: 'some-other-match' }));
    await flush();

    expect(controller.getSnapshot().incoming).toMatchObject({
      callId: 'c-x',
      matchId: 'some-other-match',
    });
  });

  it('accepting builds a CALLEE session for the incoming call and dismisses the modal', async () => {
    const { controller, sessions, emit } = harness();
    emit(incomingEvent());
    await flush();

    await controller.acceptIncoming('AUDIO');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].role).toBe('callee');
    expect(sessions[0].matchId).toBe('match-1');
    expect(sessions[0].accepted).toBe('AUDIO');
    const snap = controller.getSnapshot();
    expect(snap.incoming).toBeNull();
    expect(snap.active).toBe(true);
  });

  it('declining calls declineCall and clears the modal', async () => {
    const { controller, declineCall, emit } = harness();
    emit(incomingEvent());
    await flush();

    await controller.declineIncoming();

    expect(declineCall).toHaveBeenCalledWith('call-1');
    expect(controller.getSnapshot().incoming).toBeNull();
  });

  it('suppresses a new INCOMING while a call is already active (backend returns BUSY)', async () => {
    const { controller, sessions, emit } = harness();

    await controller.startCall({ matchId: 'm9', peerId: 'p9', peerName: 'Sam', media: 'VIDEO' });
    expect(controller.getSnapshot().active).toBe(true);
    expect(sessions[0].role).toBe('caller');

    emit(incomingEvent({ callId: 'c-busy', matchId: 'm-busy' }));
    await flush();

    // No ring modal is shown over the live call, and no second session is created.
    expect(controller.getSnapshot().incoming).toBeNull();
    expect(sessions).toHaveLength(1);
  });

  it('starts an outbound call from a conversation through the controller', async () => {
    const { controller, sessions } = harness();

    await controller.startCall({ matchId: 'm-out', peerId: 'p-out', peerName: 'Sam', media: 'AUDIO' });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].role).toBe('caller');
    expect(sessions[0].started).toBe(true);
    const snap = controller.getSnapshot();
    expect(snap.active).toBe(true);
    expect(snap.activeMatchId).toBe('m-out');
  });
});
