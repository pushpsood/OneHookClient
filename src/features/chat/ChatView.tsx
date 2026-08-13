import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MessageStatus } from 'onehook-api-client/graphql';
import type { ChatMessageDTO, UserProfile } from '../../types';
import { StateApi } from '../../api/state';
import { useChatMessages } from '../../hooks/use-api';
import { ApiError } from '../../lib/api-client';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useToast } from '../../components/common/Toast';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';

export function ChatView({
  currentUser,
  matchId,
}: {
  key?: string;
  currentUser: UserProfile;
  matchId: string | null;
}) {
  const [recipientId, setRecipientId] = useState<string | undefined>(undefined);

  // Resolve the peer (the other participant) from the match record so we can
  // establish an E2EE session with them when sending messages.
  useEffect(() => {
    if (!matchId) {
      setRecipientId(undefined);
      return;
    }
    let active = true;
    StateApi.getMatch(matchId)
      .then((match) => {
        if (!active) return;
        const peer = match.userA === currentUser.id ? match.userB : match.userA;
        setRecipientId(peer ?? undefined);
      })
      .catch(() => {
        /* peer resolution is best-effort; sending stays disabled until known */
      });
    return () => {
      active = false;
    };
  }, [matchId, currentUser.id]);

  const { messages, loading, error, sendMessage, markAsDelivered, markAsRead } = useChatMessages(
    matchId || '',
    recipientId
  );
  const [input, setInput] = useState('');
  const { showToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as delivered when they appear
  useEffect(() => {
    messages
      .filter((m) => m.senderId !== 'me' && m.status === 'SENT')
      .forEach((m) => markAsDelivered(m.messageId));
  }, [messages, markAsDelivered]);

  // Mark messages as read when user is viewing
  useEffect(() => {
    const timer = setTimeout(() => {
      messages
        .filter((m) => m.senderId !== 'me' && m.status === 'DELIVERED')
        .forEach((m) => markAsRead(m.messageId));
    }, 1000);

    return () => clearTimeout(timer);
  }, [messages, markAsRead]);

  const handleSend = async () => {
    if (!input.trim() || !matchId) return;

    try {
      await sendMessage(input);
      setInput('');
    } catch (error) {
      if (error instanceof ApiError) {
        showToast(error.message, 'error');
      }
    }
  };

  const getMessageStatusIcon = (message: ChatMessageDTO) => {
    if (message.senderId !== 'me') return null;

    switch (message.status) {
      case MessageStatus.Sending:
        return <span className="text-[8px] opacity-30">⏱</span>;
      case MessageStatus.Sent:
        return <span className="text-[8px] opacity-50">✓</span>;
      case MessageStatus.Delivered:
        return <span className="text-[8px] opacity-70">✓✓</span>;
      case MessageStatus.Read:
        return <span className="text-[8px] text-blue-500">✓✓</span>;
      case MessageStatus.Failed:
        return <span className="text-[8px] text-red-500">✗</span>;
      default:
        return null;
    }
  };

  if (!matchId) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12"
      >
        <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">No Match Yet</h2>
          <p className="text-xs opacity-60 leading-relaxed italic">
            Head to Discovery when you&rsquo;re ready to find someone new.
          </p>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center"
      >
        <LoadingSpinner size="lg" />
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12"
      >
        <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
            We Couldn&rsquo;t Load This Chat
          </h2>
          <p className="text-xs opacity-60 leading-relaxed italic">{error.message}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex overflow-hidden"
    >
      {/* Profile Panel */}
      <section className="w-[420px] border-r border-border flex flex-col bg-bg">
        <div className="p-10 flex-1 overflow-y-auto">
          <div className="relative mb-8">
            <div className="aspect-[3/4] w-full bg-border overflow-hidden grayscale grayscale-hover">
              <img
                src={currentUser.photos?.[0] || FALLBACK_PROFILE_IMAGE}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white p-5 border border-accent">
              <div className="text-[9px] uppercase tracking-widest opacity-40 mb-1 font-bold">
                Connection Status
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-status-hooked animate-pulse"></div>
                <span className="text-xs font-black uppercase tracking-widest">Hooked</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-3xl font-serif italic">Match</h2>
              <span className="text-sm opacity-40 italic">Active</span>
            </div>
            <p className="text-xs leading-relaxed opacity-60">
              Take your time, be yourself, and enjoy getting to know each other.
            </p>
          </div>
        </div>

        <div className="p-10 border-t border-border bg-[#F9F9F9]">
          <div className="text-[10px] uppercase tracking-[0.2em] mb-4 text-accent font-black">
            Focus Mode
          </div>
          <p className="text-[10px] opacity-50 leading-relaxed mb-6 italic">
            Discovery is paused while you&rsquo;re connected, and your chat stays private with
            end-to-end encryption.
          </p>
        </div>
      </section>

      {/* Chat Panel */}
      <section className="flex-1 flex flex-col bg-white">
        {/* Chat Header */}
        <div className="px-10 py-8 border-b border-border flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs font-black uppercase tracking-[0.2em]">Private Chat</div>
            <div className="text-[9px] opacity-30 uppercase tracking-widest font-mono">
              End-to-End Encrypted
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="text-[9px] opacity-30 uppercase tracking-widest">Match ID</div>
            <div className="text-xs font-bold font-mono">{matchId.substring(0, 8)}</div>
          </div>
        </div>

        {/* Message History */}
        <div className="flex-1 p-10 space-y-8 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs opacity-40 italic">
                No messages yet. Break the ice whenever you&rsquo;re ready.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.messageId} className={`max-w-md ${m.senderId === 'me' ? 'ml-auto' : ''}`}>
                <div
                  className={`text-[9px] uppercase tracking-widest opacity-40 mb-2 flex items-center gap-2 ${
                    m.senderId === 'me' ? 'justify-end' : ''
                  }`}
                >
                  <span>{m.senderId === 'me' ? 'You' : 'Them'}</span>
                  {getMessageStatusIcon(m)}
                </div>
                <div
                  className={`p-6 text-sm leading-relaxed relative ${
                    m.senderId === 'me'
                      ? 'bg-accent text-white shadow-xl shadow-accent/5'
                      : 'bg-[#F2F2F2] text-accent'
                  }`}
                >
                  {m.ciphertext}
                  {m.status === 'FAILED' && (
                    <div className="mt-2 text-[10px] text-red-300 flex items-center gap-1">
                      <span>Didn&rsquo;t send</span>
                      <button
                        onClick={() => sendMessage(m.ciphertext)}
                        className="underline hover:opacity-70"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="p-10 border-t border-border">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              type="text"
              placeholder="Write a message…"
              className="w-full py-4 px-0 border-b border-accent focus:border-b-2 transition-all outline-none text-sm bg-transparent placeholder:opacity-30 italic font-serif"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="absolute right-0 bottom-4 text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-50 transition-opacity disabled:opacity-20"
            >
              Send
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between text-[8px] opacity-20 uppercase tracking-[0.3em] font-mono">
            <span>Connected</span>
            <span>One Connection at a Time</span>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
