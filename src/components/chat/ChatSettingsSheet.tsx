import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import {
  ChatSettingsApi,
  type ChatSettings,
  type LastSeenVisibility,
} from '../../api/rest';
import { ApiError } from '../../lib/api-client';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useToast } from '../common/Toast';
import type { ChatWallpaper } from '../../lib/chat-appearance';
import { WallpaperGrid } from './WallpaperGrid';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';

/**
 * Chat & appearance settings. Reads `GET /chat/settings` on open and persists each change with a
 * partial `PUT /chat/settings`. The wallpaper section reads/writes the SAME shared store as the
 * shield menu's "Choose wallpaper" (see chat-appearance.ts), so the two can never disagree.
 */
export function ChatSettingsSheet({
  open,
  onClose,
  wallpaper,
  onChooseWallpaper,
}: {
  open: boolean;
  onClose: () => void;
  wallpaper: ChatWallpaper;
  onChooseWallpaper: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    ChatSettingsApi.get()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Could not load chat settings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  // Optimistic partial update: apply locally, PUT only the changed field, revert on failure.
  const patch = async (change: Partial<ChatSettings>) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...change });
    try {
      const updated = await ChatSettingsApi.update(change);
      setSettings(updated);
    } catch (err) {
      setSettings(previous);
      showToast(
        err instanceof ApiError ? err.message : 'Could not save that setting. Please try again.',
        'error'
      );
    }
  };

  const toggles: { key: keyof ChatSettings; label: string; kind: 'notification' | 'privacy'; hint?: string }[] = [
    { key: 'messageNotifications', label: 'Message notifications', kind: 'notification' },
    { key: 'showPreviews', label: 'Show message previews', kind: 'notification' },
    { key: 'reactionNotifications', label: 'Reaction notifications', kind: 'notification' },
    { key: 'readReceipts', label: 'Read receipts', kind: 'privacy' },
    { key: 'typingIndicators', label: 'Typing indicators', kind: 'privacy' },
    { key: 'screenshotProtection', label: 'Screenshot protection', kind: 'privacy' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 md:p-6"
          onClick={onClose}
          data-track-exempt="backdrop: click-away that closes the chat-settings sheet; the explicit close control (chat.settings_open dismiss) is tracked."
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="dialog"
            aria-label="Chat settings"
            className="w-full max-w-md bg-surface-card text-text border border-border shadow-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-lg font-serif italic font-bold text-text">Chat settings</h2>
              <button
                onClick={onClose}
                {...trackProps(UiElement.CHAT_SETTINGS_OPEN, { action: 'dismiss' })}
                className="p-2 border border-border hover:border-accent hover:bg-surface-hover transition-colors rounded-lg cursor-pointer"
                aria-label="Close chat settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <LoadingSpinner size="md" />
                </div>
              ) : error ? (
                <p className="text-xs text-red-500 italic py-6 text-center">{error}</p>
              ) : settings ? (
                <>
                  <div className="space-y-3">
                    {toggles.map((t) => (
                      <label
                        key={t.key}
                        {...trackProps(
                          t.kind === 'notification'
                            ? UiElement.CHAT_SETTINGS_NOTIFICATION_TOGGLE
                            : UiElement.CHAT_SETTINGS_PRIVACY_TOGGLE,
                          { value: settings[t.key] ? 'off' : 'on', targetId: t.key }
                        )}
                        className="flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <span className="text-sm">{t.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(settings[t.key])}
                          onChange={(e) => void patch({ [t.key]: e.target.checked } as Partial<ChatSettings>)}
                          className="w-5 h-5 accent-accent"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                      Last seen visibility
                    </label>
                    <select
                      value={settings.lastSeenVisibility}
                      onChange={(e) => {
                        trackUi(UiElement.CHAT_SETTINGS_LAST_SEEN_SELECT);
                        void patch({ lastSeenVisibility: e.target.value as LastSeenVisibility });
                      }}
                      className="w-full p-3 border border-border text-xs bg-surface text-text rounded-xl outline-none focus:border-accent"
                    >
                      <option value="EVERYONE">Everyone</option>
                      <option value="MATCHES">Matches only</option>
                      <option value="NOBODY">Nobody</option>
                    </select>
                  </div>

                  {/*
                    Calls — "Help translate my captions" (OneHookBackend/docs/voice-video-calls.md
                    D13). When on, this device may translate its OWN live call captions on-device for a
                    partner whose device cannot do the language pair (the §12.5 sender fallback). It is
                    on-device only and never sends caption text anywhere; default off because it uses
                    this device's battery and may download translation models.
                  */}
                  <div className="space-y-2 border-t border-border pt-5">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                      Calls
                    </label>
                    <label
                      {...trackProps(UiElement.CHAT_SETTINGS_HELP_TRANSLATE_CAPTIONS, {
                        value: settings.helpTranslateCaptions ? 'off' : 'on',
                      })}
                      className="flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm">Help translate my captions</span>
                        <span className="text-[11px] text-text-muted leading-tight max-w-[18rem]">
                          Let your device translate your live call captions for a partner whose device
                          can&rsquo;t. On-device only; uses battery and may download language models.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(settings.helpTranslateCaptions)}
                        onChange={(e) => void patch({ helpTranslateCaptions: e.target.checked })}
                        className="w-5 h-5 accent-accent shrink-0"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                      Default disappearing messages (seconds, 0 = off)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={settings.defaultDisappearingSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultDisappearingSeconds: Number(e.target.value) || 0,
                        })
                      }
                      onBlur={(e) => {
                        trackUi(UiElement.CHAT_SETTINGS_DISAPPEARING_SELECT);
                        void patch({ defaultDisappearingSeconds: Number(e.target.value) || 0 });
                      }}
                      className="w-full p-3 border border-border text-xs bg-surface text-text rounded-xl outline-none focus:border-accent"
                    />
                  </div>
                </>
              ) : null}

              {/* Appearance — same wallpaper store as the shield menu. */}
              <div className="space-y-3 border-t border-border pt-5">
                <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                  Chat wallpaper
                </label>
                <WallpaperGrid current={wallpaper} onChoose={onChooseWallpaper} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
