import { appSyncClient } from './chat';
import { hasGraphQLErrors, toGraphQLError } from './graphql-error';

/**
 * 1:1 voice / video call signalling + lifecycle API (OneHookBackend/docs/voice-video-calls.md §8).
 *
 * Mirrors `chat.ts`: every operation goes over the SAME Cognito-authorized AppSync connection
 * (`appSyncClient()`), failures are normalised through `graphql-error.ts` so the server's own message
 * and `errorType` survive, and subscriptions return an unsubscribe function.
 *
 * This is the SIGNALING plane only. Media is peer-to-peer WebRTC over a relay-only TURN path and is
 * end-to-end encrypted; the backend only routes `ciphertext` (sealed SDP / ICE — see
 * `call-signal.ts` + `chat-encryption.ts`) and the call metadata it needs for routing, push and
 * safety. No SDP, ICE or ciphertext is ever logged here.
 *
 * The enums and types below are declared locally rather than imported from `onehook-api-client`
 * because that SDK is regenerated and republished from the backend schema asynchronously (same
 * reasoning as the rich-messaging types in `chat.ts`). They can be swapped for the generated types
 * once the SDK republishes.
 */

/** Mirrors the GraphQL `CallMedia` enum. */
export type CallMedia = 'AUDIO' | 'VIDEO';

/** Mirrors the GraphQL `CallStatus` enum. */
export type CallStatus = 'RINGING' | 'ACCEPTED' | 'CONNECTED' | 'ENDED';

/** Mirrors the GraphQL `CallEndReason` enum. */
export type CallEndReason =
  | 'HANGUP'
  | 'DECLINED'
  | 'CANCELLED'
  | 'MISSED'
  | 'BUSY'
  | 'FAILED'
  | 'DROPPED'
  | 'UNMATCHED'
  | 'MAX_DURATION'
  | 'ANSWERED_ELSEWHERE';

/** Mirrors the GraphQL `CallEventKind` enum. */
export type CallEventKind =
  | 'INCOMING'
  | 'ACCEPTED'
  | 'CONNECTED'
  | 'SIGNAL'
  | 'ENDED'
  | 'ANSWERED_ELSEWHERE';

/** One TURN/STUN server entry. `credential` is short-lived; never log it. */
export interface IceServer {
  urls: string[];
  username?: string | null;
  credential?: string | null;
}

/** Short-lived TURN configuration. Refresh before `ttlSeconds` elapses (ICE restart on long calls). */
export interface IceServerConfig {
  iceServers: IceServer[];
  ttlSeconds: number;
  /** Server-controlled; "relay" so peers never learn each other's IP address. */
  iceTransportPolicy: string;
}

/** A call's authoritative state. `offerCiphertext` / `answerCiphertext` are sealed SDP — never logged. */
export interface Call {
  callId: string;
  matchId: string;
  callerId: string;
  calleeId: string;
  /** The caller's device: the callee seals its answer (and ICE) to exactly this device. */
  callerDeviceId?: string | null;
  media: CallMedia;
  status: CallStatus;
  endReason?: CallEndReason | null;
  answeredByDeviceId?: string | null;
  offerCiphertext?: string | null;
  answerCiphertext?: string | null;
  createdAt: number;
  acceptedAt?: number | null;
  connectedAt?: number | null;
  endedAt?: number | null;
  /** Connected duration in milliseconds (0 if it never connected). */
  durationMs: number;
}

/** A real-time call event, delivered per USER over `onCallEvent`. `ciphertext` is sealed; never log it. */
export interface CallEvent {
  userId: string;
  callId: string;
  matchId: string;
  kind: CallEventKind;
  media?: CallMedia | null;
  fromDeviceId?: string | null;
  /** SIGNAL only: the device the payload is sealed for. Other devices of the recipient ignore it. */
  toDeviceId?: string | null;
  ciphertext?: string | null;
  endReason?: CallEndReason | null;
  at: number;
}

/**
 * Mirrors the GraphQL `CallEligibility` type — whether the signed-in user may currently START a call
 * in this match. `startCall` still enforces the same rule server-side (rejecting with
 * `errorType: CallNotAllowed`); this query lets the UI reflect the gate BEFORE the tap, so the call
 * buttons can show a locked affordance instead of letting the user discover the block on failure.
 *
 * `reason` is a machine code (e.g. `MESSAGE_FIRST` when the two participants have not both sent at
 * least one message); `message` is the server's own copy for that reason.
 */
export interface CallEligibility {
  allowed: boolean;
  reason?: string | null;
  message?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL documents (AppSync schema: OneHookBackend/packages/api-models/model/schema.graphql)
// ─────────────────────────────────────────────────────────────────────────────

/** Every field a client ever needs off a `Call`; the server hides offer/answer by role + state. */
const CALL_FIELDS = /* GraphQL */ `
  callId
  matchId
  callerId
  calleeId
  callerDeviceId
  media
  status
  endReason
  answeredByDeviceId
  offerCiphertext
  answerCiphertext
  createdAt
  acceptedAt
  connectedAt
  endedAt
  durationMs
`;

const GET_ICE_SERVERS = /* GraphQL */ `
  query GetIceServers($matchId: ID!, $deviceId: ID!) {
    getIceServers(matchId: $matchId, deviceId: $deviceId) {
      iceServers { urls username credential }
      ttlSeconds
      iceTransportPolicy
    }
  }
`;

const GET_CALL_ELIGIBILITY = /* GraphQL */ `
  query GetCallEligibility($matchId: ID!) {
    getCallEligibility(matchId: $matchId) {
      allowed
      reason
      message
    }
  }
`;

const GET_CALL = /* GraphQL */ `
  query GetCall($callId: ID!) {
    getCall(callId: $callId) { ${CALL_FIELDS} }
  }
`;

const GET_ACTIVE_CALL = /* GraphQL */ `
  query GetActiveCall {
    getActiveCall { ${CALL_FIELDS} }
  }
`;

const GET_CALL_HISTORY = /* GraphQL */ `
  query GetCallHistory($matchId: ID!, $before: AWSTimestamp, $limit: Int) {
    getCallHistory(matchId: $matchId, before: $before, limit: $limit) { ${CALL_FIELDS} }
  }
`;

const START_CALL = /* GraphQL */ `
  mutation StartCall($matchId: ID!, $media: CallMedia!, $fromDeviceId: ID!, $offerCiphertext: String!) {
    startCall(matchId: $matchId, media: $media, fromDeviceId: $fromDeviceId, offerCiphertext: $offerCiphertext) {
      ${CALL_FIELDS}
    }
  }
`;

const ACCEPT_CALL = /* GraphQL */ `
  mutation AcceptCall($callId: ID!, $deviceId: ID!, $answerCiphertext: String!) {
    acceptCall(callId: $callId, deviceId: $deviceId, answerCiphertext: $answerCiphertext) { ${CALL_FIELDS} }
  }
`;

const DECLINE_CALL = /* GraphQL */ `
  mutation DeclineCall($callId: ID!) {
    declineCall(callId: $callId) { ${CALL_FIELDS} }
  }
`;

const END_CALL = /* GraphQL */ `
  mutation EndCall($callId: ID!, $reason: CallEndReason!) {
    endCall(callId: $callId, reason: $reason) { ${CALL_FIELDS} }
  }
`;

const HEARTBEAT_CALL = /* GraphQL */ `
  mutation HeartbeatCall($callId: ID!) {
    heartbeatCall(callId: $callId) { ${CALL_FIELDS} }
  }
`;

const RELAY_CALL_SIGNAL = /* GraphQL */ `
  mutation RelayCallSignal(
    $matchId: ID!
    $callId: ID!
    $toUserId: ID!
    $toDeviceId: ID!
    $fromDeviceId: ID!
    $ciphertext: String!
  ) {
    relayCallSignal(
      matchId: $matchId
      callId: $callId
      toUserId: $toUserId
      toDeviceId: $toDeviceId
      fromDeviceId: $fromDeviceId
      ciphertext: $ciphertext
    ) {
      userId
      callId
      matchId
      kind
      toDeviceId
      fromDeviceId
      at
    }
  }
`;

const ON_CALL_EVENT = /* GraphQL */ `
  subscription OnCallEvent($userId: ID!) {
    onCallEvent(userId: $userId) {
      userId
      callId
      matchId
      kind
      media
      fromDeviceId
      toDeviceId
      ciphertext
      endReason
      at
    }
  }
`;

function client() {
  return appSyncClient();
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let res: unknown;
  try {
    res = await client().graphql({ query, variables });
  } catch (raw) {
    // Amplify rejects with a plain `{ data, errors }` object, not an Error; converting here keeps the
    // server's `errorType` (CallNotAllowed, Throttled, Conflict, …) so callers can map it to copy.
    throw toGraphQLError(raw, 'The call service could not be reached.');
  }
  if (hasGraphQLErrors(res)) {
    throw toGraphQLError(res, 'The call service rejected the request.');
  }
  return (res as { data: T }).data;
}

/**
 * Voice / video call API. `offerCiphertext` / `answerCiphertext` / signal `ciphertext` are sealed with
 * the chat E2EE envelope before they reach this boundary, so no plaintext SDP ever crosses it.
 */
export const CallApi = {
  /**
   * Short-lived TURN credentials for this device. Prefetch in parallel with {@link startCall} on the
   * caller, and on push / INCOMING on the callee; refresh before `ttlSeconds` on long calls.
   */
  getIceServers: async (matchId: string, deviceId: string): Promise<IceServerConfig | null> => {
    const data = await graphql<{ getIceServers: IceServerConfig | null }>(GET_ICE_SERVERS, {
      matchId,
      deviceId,
    });
    return data.getIceServers;
  },

  /**
   * Whether the signed-in user may START a call in this match right now. When `allowed` is false the
   * UI should render the call buttons in a locked state and show `message`; `reason` is the machine
   * code (e.g. `MESSAGE_FIRST`). This is advisory only — `startCall` still enforces the same rule and
   * rejects with `errorType: CallNotAllowed` — so callers MUST fail open if this query errors.
   */
  getCallEligibility: async (matchId: string): Promise<CallEligibility | null> => {
    const data = await graphql<{ getCallEligibility: CallEligibility | null }>(GET_CALL_ELIGIBILITY, {
      matchId,
    });
    return data.getCallEligibility;
  },

  /** Current state of one call (participants only). A device woken by push reads the sealed offer here. */
  getCall: async (callId: string): Promise<Call | null> => {
    const data = await graphql<{ getCall: Call | null }>(GET_CALL, { callId });
    return data.getCall;
  },

  /** The caller's live call, if any — cold-start recovery after an app restart. */
  getActiveCall: async (): Promise<Call | null> => {
    const data = await graphql<{ getActiveCall: Call | null }>(GET_ACTIVE_CALL, {});
    return data.getActiveCall;
  },

  /** Calls in a match, newest first, for the conversation timeline. `before` is a createdAt cursor. */
  getCallHistory: async (
    matchId: string,
    before?: number,
    limit?: number
  ): Promise<Call[]> => {
    const data = await graphql<{ getCallHistory: (Call | null)[] | null }>(GET_CALL_HISTORY, {
      matchId,
      before: before ?? null,
      limit: limit ?? null,
    });
    return (data.getCallHistory ?? []).filter((c): c is Call => c != null);
  },

  /**
   * Start a call. Returns RINGING, or a call with `status: ENDED` + `endReason: BUSY` when the callee
   * is already on another call. Throws a {@link import('./graphql-error').GraphQLOperationError} whose
   * `errorType` is one of Unauthorized, CallNotAllowed, Throttled, Conflict, BadRequest.
   */
  startCall: async (
    matchId: string,
    media: CallMedia,
    fromDeviceId: string,
    offerCiphertext: string
  ): Promise<Call> => {
    const data = await graphql<{ startCall: Call }>(START_CALL, {
      matchId,
      media,
      fromDeviceId,
      offerCiphertext,
    });
    return data.startCall;
  },

  /** Callee only. First device wins; later devices get a `Conflict` errorType. */
  acceptCall: async (callId: string, deviceId: string, answerCiphertext: string): Promise<Call> => {
    const data = await graphql<{ acceptCall: Call }>(ACCEPT_CALL, {
      callId,
      deviceId,
      answerCiphertext,
    });
    return data.acceptCall;
  },

  /** Callee only, while RINGING. Idempotent. */
  declineCall: async (callId: string): Promise<Call> => {
    const data = await graphql<{ declineCall: Call }>(DECLINE_CALL, { callId });
    return data.declineCall;
  },

  /**
   * End a call. `reason` is HANGUP | CANCELLED | MISSED (caller's ring timer) | FAILED; the server
   * normalizes it by role and state. Idempotent.
   */
  endCall: async (callId: string, reason: CallEndReason): Promise<Call> => {
    const data = await graphql<{ endCall: Call }>(END_CALL, { callId, reason });
    return data.endCall;
  },

  /** Every 30 s from each side once answered. The first one moves ACCEPTED → CONNECTED. */
  heartbeatCall: async (callId: string): Promise<Call> => {
    const data = await graphql<{ heartbeatCall: Call }>(HEARTBEAT_CALL, { callId });
    return data.heartbeatCall;
  },

  /** Relay a sealed SDP / ICE batch to ONE device of the other participant. Nothing is stored. */
  relayCallSignal: async (params: {
    matchId: string;
    callId: string;
    toUserId: string;
    toDeviceId: string;
    fromDeviceId: string;
    ciphertext: string;
  }): Promise<void> => {
    await graphql<{ relayCallSignal: CallEvent }>(RELAY_CALL_SIGNAL, { ...params });
  },

  /**
   * Subscribe to every call event for the signed-in user (INCOMING, ACCEPTED, CONNECTED, SIGNAL,
   * ENDED, ANSWERED_ELSEWHERE). Per USER, so a device learns of a call it did not start. Returns an
   * unsubscribe function.
   */
  subscribeToCallEvents: (userId: string, onEvent: (event: CallEvent) => void): (() => void) => {
    const sub = (
      client().graphql({ query: ON_CALL_EVENT, variables: { userId } }) as unknown as {
        subscribe: (o: {
          next: (v: { data?: { onCallEvent?: CallEvent } }) => void;
          error: (e: unknown) => void;
        }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onCallEvent) onEvent(data.onCallEvent);
      },
      // Never log the event body (it carries sealed ciphertext); only the subscription-level error.
      error: (err) => console.error('[calls] onCallEvent subscription error', err),
    });
    return () => sub.unsubscribe();
  },
};
