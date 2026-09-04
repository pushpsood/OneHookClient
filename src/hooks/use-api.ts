import { useState, useEffect, useCallback, useMemo } from 'react';
import { ApiError } from '../lib/api-client';
import { useAppStore } from '../store/app-store';
import {
  ChatMessageDTO,
  ChatMessageView,
  DiscoveryCandidate,
  UserPreferences,
  UserProfile,
  UserStateSnapshot,
} from '../types';
import type { DiscoverResponse } from 'onehook-api-client';
import { MessageStatus } from 'onehook-api-client/graphql';
import { PreferencesApi } from '../api/preferences';
import { StateApi } from '../api/state';
import { ProfileApi } from '../api/profile';
import { MatchingApi } from '../api/matching';
import { ChatMessagingApi } from '../api/chat';
import { ChatEncryptionManager } from '../lib/chat-encryption';
import { isUndecryptableMessageError } from '../lib/chat-wire-v2';
import {
  Coordinates,
  isValidCoordinate,
  resolveFallbackCoordinates,
} from '../utils/location';

export function useAsync<T>(fn: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fn();
      setData(result);
    } catch (err) {
      console.error('useAsync error:', err);
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useProfile(userId?: string) {
  const { currentUser, setCurrentUser } = useAppStore();

  const { data, loading, error, refetch } = useAsync<UserProfile>(async () => {
    let uid = userId || currentUser?.id;
    if (!uid) {
      const { fetchAuthSession } = await import('aws-amplify/auth');
      const session = await fetchAuthSession();
      uid = (session.tokens?.idToken?.payload?.sub as string) || (session.tokens?.accessToken?.payload?.sub as string) || 'me';
    }
    const res: any = await ProfileApi.get(uid);
    if (res) {
      res.id = res.userId || uid;
      res.name = res.displayName || res.name || '';
      res.photos = res.pictures && res.pictures.length > 0 ? res.pictures : res.photos || [];
    }
    return res as UserProfile;
  }, [userId, currentUser?.id]);

  useEffect(() => {
    if (data && !userId) {
      setCurrentUser(data);
    }
  }, [data, userId, setCurrentUser]);

  return { profile: data, loading, error, refetch };
}

/**
 * Fetches the authoritative user state (`GET /state/{userId}`) and publishes it to the store.
 *
 * <p>This is the single place the UI learns the subscription tier and connection state. It is
 * deliberately sourced from the State service rather than the profile, because the Profile read
 * model intentionally omits `subscriptionTier` — reading it off a profile silently yields
 * `undefined`, which previously made every user look PREMIUM.</p>
 *
 * <p>The same response also carries `matchIds`, so matches are derived here instead of issuing a
 * second identical request.</p>
 */
export function useUserState() {
  const { currentUser, setUserState, setMatches } = useAppStore();

  const { data, loading, error, refetch } = useAsync<UserStateSnapshot>(
    async () => {
      let uid = currentUser?.id;
      if (!uid) {
        const { fetchAuthSession } = await import('aws-amplify/auth');
        const session = await fetchAuthSession();
        uid = (session.tokens?.idToken?.payload?.sub as string) || (session.tokens?.accessToken?.payload?.sub as string) || 'me';
      }
      return StateApi.getUserState(uid);
    },
    [currentUser?.id]
  );

  useEffect(() => {
    if (!data) return;
    setUserState(data);
    // Map matchIds to the minimal Match[] shape the UI expects.
    setMatches((data.matchIds ?? []).map((id: string) => ({ matchId: id })) as never);
  }, [data, setUserState, setMatches]);

  return { userState: data, loading, error, refetch };
}

export function useMatches() {
  const { matches } = useAppStore();
  const { loading, error, refetch } = useUserState();

  return { matches, loading, error, refetch };
}

function calculateAge(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const dob = new Date(birthDate);
  if (isNaN(dob.getTime())) return undefined;
  const diff = Date.now() - dob.getTime();
  const ageDt = new Date(diff);
  return Math.abs(ageDt.getUTCFullYear() - 1970);
}

function toDiscoveryCandidate(
  candidate: DiscoverResponse['candidates'][number]
): DiscoveryCandidate {
  const id = candidate.userId;
  return {
    id,
    userId: id,
    name: id,
    location:
      candidate.distanceKm == null
        ? 'Nearby'
        : `${candidate.distanceKm.toFixed(1)} km away`,
    bio:
      candidate.score != null
        ? `${Math.round(candidate.score * 100)}% match based on your shared lifestyle & passions.`
        : '',
    distance: candidate.distanceKm,
    distanceKm: candidate.distanceKm,
    score: candidate.score,
    photos: [],
  };
}

export function useCandidates(activeCoords?: Coordinates) {
  const { currentUser, setCandidates } = useAppStore();
  const [candidatesList, setCandidatesList] = useState<DiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const uid = currentUser?.id;

  // Resolve coordinates: explicit activeCoords -> currentUser.location -> Tier 2/3 fallback
  const resolvedCoords = useMemo(() => {
    if (activeCoords && isValidCoordinate(activeCoords.lat, activeCoords.lon)) {
      return activeCoords;
    }
    const storeLat = currentUser?.location?.lat;
    const storeLon = currentUser?.location?.lng;
    if (isValidCoordinate(storeLat, storeLon)) {
      return { lat: storeLat!, lon: storeLon! };
    }
    return resolveFallbackCoordinates(currentUser?.currentLocation || currentUser?.hometown).coords;
  }, [activeCoords, currentUser?.location?.lat, currentUser?.location?.lng, currentUser?.currentLocation, currentUser?.hometown]);

  const lat = resolvedCoords.lat;
  const lon = resolvedCoords.lon;

  useEffect(() => {
    let active = true;
    async function fetchDiscover() {
      setLoading(true);
      setError(null);
      try {
        let userId = uid;
        if (!userId) {
          try {
            const { fetchAuthSession } = await import('aws-amplify/auth');
            const session = await fetchAuthSession();
            userId =
              (session.tokens?.idToken?.payload?.sub as string) ||
              (session.tokens?.accessToken?.payload?.sub as string);
          } catch {
            // continue
          }
        }
        if (!userId) {
          throw new ApiError('Authentication required to discover candidates', 401, 'UNAUTHORIZED');
        }

        const res = await MatchingApi.discover(userId, lat, lon);
        if (!active) return;

        if (res && Array.isArray(res.candidates) && res.candidates.length > 0) {
          const candidatePromises = res.candidates.map(async (candidate) => {
            const fallback = toDiscoveryCandidate(candidate);
            try {
              const fullProfile: any = await ProfileApi.get(candidate.userId);
              if (fullProfile) {
                const photos =
                  fullProfile.pictures && fullProfile.pictures.length > 0
                    ? fullProfile.pictures
                    : fullProfile.photos || [];
                return {
                  ...fallback,
                  ...fullProfile,
                  id: candidate.userId,
                  userId: candidate.userId,
                  name: fullProfile.displayName || fullProfile.name || fallback.name,
                  displayName: fullProfile.displayName || fullProfile.name || fallback.name,
                  age: calculateAge(fullProfile.birthDate) ?? fallback.age,
                  bio: fullProfile.bio || fallback.bio,
                  photos: photos.length > 0 ? photos : fallback.photos,
                  pictures: photos.length > 0 ? photos : fallback.photos,
                  distance: candidate.distanceKm,
                  distanceKm: candidate.distanceKm,
                  score: candidate.score,
                } as DiscoveryCandidate;
              }
            } catch (pErr) {
              console.warn(`Could not hydrate profile for candidate ${candidate.userId}:`, pErr);
            }
            return fallback;
          });

          const mapped = await Promise.all(candidatePromises);
          if (active) {
            setCandidatesList(mapped);
            setCandidates(mapped);
            setError(null);
          }
        } else {
          if (active) {
            setCandidatesList([]);
            setCandidates([]);
            setError(null);
          }
        }
      } catch (err: any) {
        console.error('Matching discover error:', err);
        if (active) {
          setCandidatesList([]);
          setCandidates([]);
          const message =
            err?.message ||
            err?.name ||
            'Unable to load discovery candidates. Please try again.';
          const status = err?.status || err?.$metadata?.httpStatusCode || 500;
          const code = err?.code || err?.name;
          const apiError =
            err instanceof ApiError
              ? err
              : new ApiError(message, status, code, err);
          setError(apiError);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void fetchDiscover();
    return () => {
      active = false;
    };
  }, [uid, lat, lon, refreshKey, setCandidates]);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return {
    candidates: candidatesList,
    loading,
    error,
    refresh,
  };
}

export function useSwipe() {
  const { currentUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const swipe = useCallback(
    async (targetId: string, direction: 'LEFT' | 'RIGHT') => {
      try {
        setLoading(true);
        setError(null);
        try {
          return await MatchingApi.swipe(currentUser?.id || 'me', targetId, direction);
        } catch {
          return {
            status: 'SWIPED',
            matched: direction === 'RIGHT',
            matchId: direction === 'RIGHT' ? `match-${targetId}` : undefined,
          };
        }
      } catch (err) {
        setError(err as ApiError);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [currentUser?.id]
  );

  return { swipe, loading, error };
}

/**
 * Chat messaging hook backed by AppSync GraphQL. Reads history via `getMessages`,
 * sends via `sendMessage`, and live-updates via the `onNewMessage` subscription.
 * Delivery/read receipts are premium-only mutations; failures there are ignored
 * for FREE-tier users (the server rejects them).
 */
export function useChatMessages(matchId: string, recipientId?: string) {
  const { currentUser } = useAppStore();
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  /**
   * Set when the account was reset. Messages older than this can never be opened again on this
   * account, so the UI must show one marker rather than a "restore from another device" prompt that
   * cannot possibly succeed.
   */
  const [historyHorizon, setHistoryHorizon] = useState<number | undefined>();

  const myId = currentUser?.id;

  const encryptionManager = useMemo(() => (myId ? new ChatEncryptionManager(myId) : null), [myId]);

  useEffect(() => {
    if (!encryptionManager) return;
    encryptionManager.initialize().catch(console.error);
    // Best effort: without the horizon the UI simply falls back to offering recovery, which is the
    // correct behaviour for an account that was never reset.
    encryptionManager
      .historyHorizon()
      .then(setHistoryHorizon)
      .catch(() => undefined);
  }, [encryptionManager]);

  const createMessageId = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }, []);

  const decryptInbound = useCallback(
    async (ciphertext: string): Promise<{ text: string; undecryptable: boolean }> => {
      // Wire v2 envelopes carry their own wrapped content key, so decryption needs neither the peer's
      // identity nor a network round-trip — a message opens even before the peer profile resolves.
      if (!encryptionManager) return { text: '[Unable to decrypt]', undecryptable: false };
      try {
        return {
          text: await encryptionManager.decryptMessage(matchId, ciphertext),
          undecryptable: false,
        };
      } catch (err) {
        // Only "no key on this device" is recoverable — that is history written before this device
        // was registered, and history recovery fixes it. Everything else (transport, malformed
        // envelope, retired format) stays a plain error so the UI does not promise a fix that cannot
        // work.
        if (isUndecryptableMessageError(err)) {
          return { text: '', undecryptable: true };
        }
        return { text: '[Unable to decrypt]', undecryptable: false };
      }
    },
    [encryptionManager, matchId]
  );

  const fetchMessages = useCallback(async () => {
    if (!matchId) return;

    try {
      setLoading(true);
      setError(null);
      // Establish the E2E session BEFORE reading history. Reading the peer's device registry is what
      // initializes the conversation server-side (the ChatTable TAIL marker), and getMessages is
      // rejected outright when that marker is missing. Without this, a match with no messages yet
      // could never be opened: getMessages failed, so the composer never rendered, so no message
      // could be sent to lazily trigger initialization. Non-fatal on its own — if it fails we still
      // try to read, so an existing conversation is not blocked by a transient registry error.
      if (encryptionManager && recipientId) {
        try {
          await encryptionManager.ensureSession(recipientId, matchId);
        } catch (sessionErr) {
          console.warn('Could not establish chat encryption session:', sessionErr);
        }
      }
      const result = await ChatMessagingApi.getMessages(matchId);

      const processed = await Promise.all(
        result.map(async (message) => {
          const isMe = message.senderId === myId;
          const decrypted = await decryptInbound(message.ciphertext);
          return {
            messageId: message.messageId,
            senderId: isMe ? 'me' : message.senderId,
            ciphertext: decrypted.text,
            undecryptable: decrypted.undecryptable,
            timestamp: message.timestamp,
            status: message.status,
            deliveredAt: message.deliveredAt ?? undefined,
            readAt: message.readAt ?? undefined,
          } as ChatMessageView;
        })
      );

      setMessages(processed);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [matchId, myId, decryptInbound, encryptionManager, recipientId]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  // Live updates via the onNewMessage subscription.
  useEffect(() => {
    if (!matchId) return;
    const unsubscribe = ChatMessagingApi.subscribeToNewMessages(matchId, (m) => {
      void (async () => {
        const isMe = m.senderId === myId;
        const decrypted = await decryptInbound(m.ciphertext);
        setMessages((prev) => {
          if (prev.some((p) => p.messageId === m.messageId)) return prev;
          return [
            ...prev,
            {
              messageId: m.messageId,
              senderId: isMe ? 'me' : m.senderId,
              ciphertext: decrypted.text,
              undecryptable: decrypted.undecryptable,
              timestamp: m.timestamp,
              status: m.status,
            } as ChatMessageView,
          ];
        });
      })();
    });
    return unsubscribe;
  }, [matchId, myId, decryptInbound]);

  const sendMessage = useCallback(
    async (plaintext: string) => {
      if (!encryptionManager || !recipientId || !matchId) return;

      const messageId = createMessageId();
      const timestamp = Date.now();

      // Encrypt locally, optimistically render plaintext.
      const ciphertext = await encryptionManager.encryptMessage(recipientId, matchId, plaintext);

      const tempMessage: ChatMessageDTO = {
        messageId,
        matchId,
        senderId: 'me',
        ciphertext: plaintext,
        timestamp,
        status: MessageStatus.Sending,
      };
      setMessages((prev) => [...prev, tempMessage]);

      try {
        const sent = await ChatMessagingApi.sendMessage(matchId, myId || 'me', ciphertext);
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === messageId
              ? {
                  ...m,
                  messageId: sent.messageId,
                  timestamp: sent.timestamp,
                  status: MessageStatus.Sent,
                }
              : m
          )
        );
        return { messageId: sent.messageId, timestamp: sent.timestamp, status: MessageStatus.Sent };
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m.messageId === messageId ? { ...m, status: MessageStatus.Failed } : m))
        );
        setError(err as ApiError);
        throw err;
      }
    },
    [createMessageId, myId, matchId, encryptionManager, recipientId]
  );

  const markAsDelivered = useCallback(
    async (messageId: string) => {
      try {
        const message = messages.find((m) => m.messageId === messageId);
        if (!message || !matchId) return;
        await ChatMessagingApi.markAsDelivered(matchId, message.timestamp, messageId, myId || 'me');
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === messageId
              ? { ...m, status: MessageStatus.Delivered, deliveredAt: Date.now() }
              : m
          )
        );
      } catch (err) {
        // Premium-gated server-side; ignore for FREE tier.
        console.debug('markAsDelivered skipped:', err);
      }
    },
    [matchId, myId, messages]
  );

  const markAsRead = useCallback(
    async (messageId: string) => {
      try {
        const message = messages.find((m) => m.messageId === messageId);
        if (!message || !matchId) return;
        await ChatMessagingApi.markAsRead(matchId, message.timestamp, messageId, myId || 'me');
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === messageId ? { ...m, status: MessageStatus.Read, readAt: Date.now() } : m
          )
        );
      } catch (err) {
        console.debug('markAsRead skipped:', err);
      }
    },
    [matchId, myId, messages]
  );

  return {
    messages,
    loading,
    error,
    sendMessage,
    markAsDelivered,
    markAsRead,
    refetch: fetchMessages,
    /** True when at least one message needs a history key this device does not have yet. */
    hasUndecryptable: messages.some((m) => m.undecryptable),
    /** Epoch start after a reset; messages older than this are permanently unreadable here. */
    historyHorizon,
  };
}

export function usePreferences(userId?: string) {
  const { currentUser } = useAppStore();
  const uid = userId || currentUser?.id || 'me';

  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await PreferencesApi.get(uid);
      setPrefs(data);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (updates: Partial<UserPreferences>) => {
      try {
        setSaving(true);
        await PreferencesApi.upsert(uid, updates);
        setPrefs((prev) => ({ ...(prev ?? { userId: uid }), ...updates }) as UserPreferences);
      } finally {
        setSaving(false);
      }
    },
    [uid]
  );

  return { prefs, loading, saving, error, save, refetch: load };
}

export function useCompleteOnboarding() {
  const { currentUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const completeOnboarding = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setLoading(true);
      setError(null);
      return await StateApi.completeOnboarding();
    } catch (err) {
      setError(err as ApiError);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  return { completeOnboarding, loading, error };
}
