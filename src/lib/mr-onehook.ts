/**
 * Mr.OneHook — the in-app AI conversation.
 *
 * This transcript is LOCAL-ONLY. It lives in React state and is persisted per-user to localStorage.
 * It MUST NEVER touch the E2EE match/chat APIs and must never be surfaced as a match: Mr.OneHook is
 * not a person and has no match record. The only network call is the existing public chatbot
 * endpoint (`POST ${chatbotUrl}/api/chat`, no auth header), exactly as `ChatbotWidget` uses it.
 */
import { useCallback, useEffect, useState } from 'react';
import { chatbotUrl } from '../utils/env.config';

export type MrOneHookMood = 'Happy' | 'Neutral' | 'Thinking' | 'Sad' | 'Excited';

export interface MrOneHookMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Marks the inline error bubble so the UI can style it distinctly and not persist noise. */
  isError?: boolean;
}

export interface MrOneHookDemographics {
  gender: string;
  sexualPreference: string;
}

// Mirrors ChatbotWidget's failure copy so the AI voice is consistent across surfaces.
const SERVER_ERROR_COPY =
  'Sorry — I got a little overwhelmed there. Give me a moment and try again.';
const NETWORK_ERROR_COPY =
  "Hmm, I can't connect right now. Check your connection and try again in a moment.";

function storageKey(userId: string): string {
  return `onehook.mrOneHook.transcript.${userId}`;
}

function loadTranscript(userId: string): MrOneHookMessage[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MrOneHookMessage[]) : [];
  } catch {
    return [];
  }
}

function saveTranscript(userId: string, messages: MrOneHookMessage[]): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    // Persist only the durable turns; error bubbles are transient UI, not conversation history.
    const durable = messages.filter((m) => !m.isError);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(durable));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export interface UseMrOneHookChat {
  messages: MrOneHookMessage[];
  loading: boolean;
  hasError: boolean;
  mood: MrOneHookMood;
  send: (text: string) => Promise<void>;
  clear: () => void;
}

export function useMrOneHookChat(
  userId: string,
  demographics: MrOneHookDemographics
): UseMrOneHookChat {
  const [messages, setMessages] = useState<MrOneHookMessage[]>(() => loadTranscript(userId));
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mood, setMood] = useState<MrOneHookMood>('Happy');

  // Reload when the signed-in user changes so transcripts never bleed across accounts.
  useEffect(() => {
    setMessages(loadTranscript(userId));
    setHasError(false);
    setMood('Happy');
  }, [userId]);

  useEffect(() => {
    saveTranscript(userId, messages);
  }, [userId, messages]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMessage: MrOneHookMessage = { role: 'user', content: trimmed };
      // Only real conversational turns go to the model (drop any prior error bubbles).
      const history = messages.filter((m) => !m.isError);
      const outbound = [...history, userMessage];
      setMessages([...messages.filter((m) => !m.isError), userMessage]);
      setLoading(true);
      setHasError(false);
      setMood('Thinking');

      try {
        const response = await fetch(`${chatbotUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: outbound.map((m) => ({ role: m.role, content: m.content })),
            userDemographics: demographics,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.reply as string },
          ]);
          setMood((data.mood as MrOneHookMood) || 'Happy');
          setHasError(false);
        } else {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: SERVER_ERROR_COPY, isError: true },
          ]);
          setMood('Sad');
          setHasError(true);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: NETWORK_ERROR_COPY, isError: true },
        ]);
        setMood('Sad');
        setHasError(true);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, demographics]
  );

  const clear = useCallback(() => {
    setMessages([]);
    setHasError(false);
    setMood('Happy');
  }, []);

  return { messages, loading, hasError, mood, send, clear };
}
