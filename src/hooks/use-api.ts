import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, ApiError } from '../lib/api-client';
import { useAppStore } from '../store/app-store';
import {
  ChatMessageDTO,
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

function serializeRequestOptions(options?: RequestInit): string {
  if (!options) return 'GET';

  const headers = options.headers
    ? Array.isArray(options.headers)
      ? options.headers
      : options.headers instanceof Headers
        ? Array.from(options.headers.entries())
        : Object.entries(options.headers)
    : [];

  return JSON.stringify({
    method: options.method ?? 'GET',
    headers,
    body: typeof options.body === 'string' ? options.body : undefined,
  });
}

export function useApi<T>(endpoint: string, options?: RequestInit, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const requestSignature = serializeRequestOptions(options);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.get<T>(endpoint, options);
      setData(result);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [endpoint, requestSignature, ...dependencies]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

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
  const uid = userId || currentUser?.id || 'me';

  const { data, loading, error, refetch } = useAsync<UserProfile>(
    () => ProfileApi.get(uid),
    [uid]
  );

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
  const uid = currentUser?.id || 'me';

  const { data, loading, error, refetch } = useAsync<UserStateSnapshot>(
    () => StateApi.getUserState(uid),
    [uid]
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

export function useCandidates() {
  const { currentUser, setCandidates } = useAppStore();
  const [refreshKey, setRefreshKey] = useState(0);

  const uid = currentUser?.id || 'me';
  const lat = currentUser?.location?.lat ?? 0;
  const lon = currentUser?.location?.lng ?? 0;

  const { data, loading, error } = useAsync(
    () => MatchingApi.discover(uid, lat, lon),
    [uid, lat, lon, refreshKey]
  );

  useEffect(() => {
    if (data?.candidates) {
      setCandidates(data.candidates.map(toDiscoveryCandidate));
    }
  }, [data, setCandidates]);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return {
    candidates: data?.candidates.map(toDiscoveryCandidate) || [],
    loading,
    error,
    refresh,
  };
}

function toDiscoveryCandidate(candidate: DiscoverResponse['candidates'][number]): DiscoveryCandidate {
  const id = candidate.userId;
  return {
    id,
    userId: id,
    name: id,
    age: 0,
    location: candidate.distanceKm == null ? 'Nearby' : `${candidate.distanceKm.toFixed(1)} km`,
    bio: `Match score ${Math.round((candidate.score ?? 0) * 100)}%. Add optional profile details to improve future ranking precision.`,
    distance: candidate.distanceKm,
    distanceKm: candidate.distanceKm,
    score: candidate.score,
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
        return await MatchingApi.swipe(currentUser?.id || 'me', targetId, direction);
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
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const myId = currentUser?.id;

  const encryptionManager = useMemo(
    () => (myId ? new ChatEncryptionManager(myId) : null),
    [myId]
  );

  useEffect(() => {
    if (encryptionManager) {
      encryptionManager.initialize().catch(console.error);
    }
  }, [encryptionManager]);

  const createMessageId = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }, []);

  const decryptInbound = useCallback(
    async (senderId: string, ciphertext: string): Promise<string> => {
      const isMe = senderId === myId;
      if (isMe) return '[Sent Message]';
      if (!encryptionManager) return ciphertext;
      try {
        return await encryptionManager.decryptMessage(senderId, matchId, ciphertext);
      } catch {
        return '[Decryption Error]';
      }
    },
    [encryptionManager, matchId, myId]
  );

  const fetchMessages = useCallback(async () => {
    if (!matchId) return;

    try {
      setLoading(true);
      setError(null);
      const result = await ChatMessagingApi.getMessages(matchId);

      const processed = await Promise.all(
        result.map(async (message) => {
          const isMe = message.senderId === myId;
          const content = await decryptInbound(message.senderId, message.ciphertext);
          return {
            messageId: message.messageId,
            senderId: isMe ? 'me' : message.senderId,
            ciphertext: content,
            timestamp: message.timestamp,
            status: message.status,
            deliveredAt: message.deliveredAt ?? undefined,
            readAt: message.readAt ?? undefined,
          } as ChatMessageDTO;
        })
      );

      setMessages(processed);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [matchId, myId, decryptInbound]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  // Live updates via the onNewMessage subscription.
  useEffect(() => {
    if (!matchId) return;
    const unsubscribe = ChatMessagingApi.subscribeToNewMessages(matchId, (m) => {
      void (async () => {
        const isMe = m.senderId === myId;
        const content = await decryptInbound(m.senderId, m.ciphertext);
        setMessages((prev) => {
          if (prev.some((p) => p.messageId === m.messageId)) return prev;
          return [
            ...prev,
            {
              messageId: m.messageId,
              senderId: isMe ? 'me' : m.senderId,
              ciphertext: content,
              timestamp: m.timestamp,
              status: m.status,
            } as ChatMessageDTO,
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
              ? { ...m, messageId: sent.messageId, timestamp: sent.timestamp, status: MessageStatus.Sent }
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
            m.messageId === messageId ? { ...m, status: MessageStatus.Delivered, deliveredAt: Date.now() } : m
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
