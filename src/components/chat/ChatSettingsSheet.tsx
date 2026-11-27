import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, ExternalLink, Trash2, X } from 'lucide-react';
import {
  ChatSettingsApi,
  type ChatNotificationKey,
  type ChatSettings,
  type LastSeenVisibility,
} from '../../api/rest';
import { ApiError } from '../../lib/api-client';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useToast } from '../common/Toast';
import {
  CHAT_FONT_SIZES,
  useChatFontSize,
  type ChatFontSize,
  type ChatWallpaper,
} from '../../lib/chat-appearance';
import { DISAPPEARING_PRESETS } from '../../lib/chat-timeline';
import { WallpaperGrid } from './WallpaperGrid';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import { useAppStore } from '../../store/app-store';
import { isMatchingOn } from '../../lib/app-mode';
import { ICON_SECTION } from '../../lib/icon-tokens';

/**
 * The `targetId` each chat-settings toggle reports: the setting's snake_case key, the same string iOS
 * (ChatSettingsViewController `settingKey`) and Android (`NotificationSwitch.settingKey`) send. The
 * chat.smithy members are camelCase; the telemetry keys are not.
 */
export const CHAT_SETTING_TELEMETRY_KEY = {
  messageNotifications: 'message_notifications',
  showPreviews: 'show_previews',
  reactionNotifications: 'reaction_notifications',
  readReceipts: 'read_receipts',
  typingIndicators: 'typing_indicators',
  screenshotProtection: 'screenshot_protection',
  connectionNotifications: 'connection_notifications',
  likeNotifications: 'like_notifications',
} as const satisfies Partial<Record<keyof ChatSettings, string>>;

/** A chat setting shown as an on/off toggle that reports a `targetId`. */
export type ChatToggleKey = keyof typeof CHAT_SETTING_TELEMETRY_KEY;

/**
 * The member-level push switches. They live in Chat settings so chat-only members (matching OFF) can
 * reach them. "Likes" only matters while matching is ON, so it is shown only then.
 */
export function notificationSwitches(
  matchingOn: boolean
): { key: ChatNotificationKey; label: string; hint: string }[] {
  const all: { key: ChatNotificationKey; label: string; hint: string; matchingOnly: boolean }[] = [
    { key: 'connectionNotifications', label: 'Connections', hint: 'Hooks, requests, calls.', matchingOnly: false },
    { key: 'likeNotifications', label: 'Likes', hint: 'When someone likes you.', matchingOnly: true },
  ];
  return all.filter((s) => matchingOn || !s.matchingOnly).map(({ key, label, hint }) => ({ key, label, hint }));
}

/** The "Notifications" section. Each switch saves through the sheet's partial update. */
export function NotificationSwitches({
  settings,
  matchingOn,
  onToggle,
}: {
  settings: Pick<ChatSettings, ChatNotificationKey>;
  matchingOn: boolean;
  onToggle: (change: Partial<Pick<ChatSettings, ChatNotificationKey>>) => void;
}) {
  return (
    <div className="space-y-3 border-t border-border pt-5">
      <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">Notifications</h3>
      {notificationSwitches(matchingOn).map((s) => (
        <label
          key={s.key}
          {...trackProps(UiElement.CHAT_SETTINGS_NOTIFICATION_TOGGLE, {
            value: settings[s.key] ? 'off' : 'on',
            targetId: CHAT_SETTING_TELEMETRY_KEY[s.key],
          })}
          className="flex items-center justify-between gap-4 cursor-pointer"
        >
          <span className="flex flex-col">
            <span className="text-sm">{s.label}</span>
            <span className="text-[11px] text-text-muted leading-tight">{s.hint}</span>
          </span>
          <input
            type="checkbox"
            checked={Boolean(settings[s.key])}
            onChange={(e) => onToggle({ [s.key]: e.target.checked })}
            className="w-5 h-5 accent-accent shrink-0"
          />
        </label>
      ))}
    </div>
  );
}

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
  onExportChat,
  exportBlockedReason,
  onClearCache,
}: {
  open: boolean;
  onClose: () => void;
  wallpaper: ChatWallpaper;
  onChooseWallpaper: (id: string) => void;
  onExportChat?: () => void;
  exportBlockedReason?: string | null;
  onClearCache?: () => void;
}) {
  const { showToast } = useToast();
  const matchingOn = useAppStore((s) => isMatchingOn(s.userState));
  const [fontSize, setFontSize] = useChatFontSize();
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

  const toggles: { key: ChatToggleKey; label: string; kind: 'notification' | 'privacy'; hint?: string }[] = [
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
                className={ICON_SECTION.modalHeader.button}
                aria-label="Close chat settings"
              >
                <X className={ICON_SECTION.modalHeader.icon} />
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
                          { value: settings[t.key] ? 'off' : 'on', targetId: CHAT_SETTING_TELEMETRY_KEY[t.key] }
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

                  <NotificationSwitches
                    settings={settings}
                    matchingOn={matchingOn}
                    onToggle={(change) => void patch(change)}
                  />

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
                    <label
                      htmlFor="chat-settings-disappearing"
                      className="text-[10px] uppercase tracking-widest font-bold opacity-60 block"
                    >
                      Default disappearing messages
                    </label>
                    <select
                      id="chat-settings-disappearing"
                      value={String(settings.defaultDisappearingSeconds)}
                      onChange={(e) => {
                        trackUi(UiElement.CHAT_SETTINGS_DISAPPEARING_SELECT);
                        void patch({ defaultDisappearingSeconds: Number(e.target.value) || 0 });
                      }}
                      className="w-full p-3 border border-border text-xs bg-surface text-text rounded-xl outline-none focus:border-accent"
                    >
                      {DISAPPEARING_PRESETS.map((p) => (
                        <option key={p.seconds} value={String(p.seconds)}>
                          {p.label}
                        </option>
                      ))}
                      {!DISAPPEARING_PRESETS.some((p) => p.seconds === settings.defaultDisappearingSeconds) && (
                        <option value={String(settings.defaultDisappearingSeconds)}>
                          Custom ({settings.defaultDisappearingSeconds}s)
                        </option>
                      )}
                    </select>
                  </div>

                  {/* Conversation restrictions enforced for all peers in your chats */}
                  <div className="space-y-3 border-t border-border pt-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                          Restrictions for your matches
                        </h3>
                        <p className="text-[11px] text-text-muted leading-tight mt-0.5">
                          Control what your matches can save, export, or share with Mr.OneHook.
                        </p>
                      </div>
                      <label
                        // TODO(telemetry-parity): switch to UiElement.CHAT_SETTINGS_RESTRICTION_TOGGLE once enabled on web.
                        data-track-exempt="disabled: pending telemetry web parity enablement for chat_settings.restriction_toggle"
                        className="flex items-center gap-1.5 text-xs font-medium cursor-pointer shrink-0"
                      >
                        <span>All</span>
                        <input
                          type="checkbox"
                          checked={
                            Boolean(settings.restrictSaveMedia) &&
                            Boolean(settings.restrictExport) &&
                            Boolean(settings.restrictMrOneHook)
                          }
                          onChange={(e) =>
                            void patch({
                              restrictSaveMedia: e.target.checked,
                              restrictExport: e.target.checked,
                              restrictMrOneHook: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-accent"
                        />
                      </label>
                    </div>

                    <label
                      // TODO(telemetry-parity): switch to UiElement.CHAT_SETTINGS_RESTRICTION_TOGGLE once enabled on web.
                      data-track-exempt="disabled: pending telemetry web parity enablement for chat_settings.restriction_toggle"
                      className="flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm">Prevent saving photos &amp; videos</span>
                        <span className="text-[11px] text-text-muted">Matches cannot download media you send.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(settings.restrictSaveMedia)}
                        onChange={(e) => void patch({ restrictSaveMedia: e.target.checked })}
                        className="w-5 h-5 accent-accent shrink-0"
                      />
                    </label>

                    <label
                      // TODO(telemetry-parity): switch to UiElement.CHAT_SETTINGS_RESTRICTION_TOGGLE once enabled on web.
                      data-track-exempt="disabled: pending telemetry web parity enablement for chat_settings.restriction_toggle"
                      className="flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm">Prevent chat export</span>
                        <span className="text-[11px] text-text-muted">Matches cannot export your conversation transcript.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(settings.restrictExport)}
                        onChange={(e) => void patch({ restrictExport: e.target.checked })}
                        className="w-5 h-5 accent-accent shrink-0"
                      />
                    </label>

                    <label
                      // TODO(telemetry-parity): switch to UiElement.CHAT_SETTINGS_RESTRICTION_TOGGLE once enabled on web.
                      data-track-exempt="disabled: pending telemetry web parity enablement for chat_settings.restriction_toggle"
                      className="flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm">Prevent sharing with Mr.OneHook</span>
                        <span className="text-[11px] text-text-muted">
                          Matches cannot include your messages or files when asking Mr.OneHook.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(settings.restrictMrOneHook)}
                        onChange={(e) => void patch({ restrictMrOneHook: e.target.checked })}
                        className="w-5 h-5 accent-accent shrink-0"
                      />
                    </label>
                  </div>
                </>
              ) : null}

              {/* Font size — synced across conversation threads */}
              <div className="space-y-2 border-t border-border pt-5">
                <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                  Message text size
                </label>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Message text size">
                  {CHAT_FONT_SIZES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFontSize(opt.id as ChatFontSize)}
                      aria-pressed={fontSize === opt.id}
                      // TODO(telemetry-parity): switch to UiElement.CHAT_SETTINGS_FONT_SIZE_SELECT once enabled on web.
                      data-track-exempt="disabled: pending telemetry web parity enablement for chat_settings.font_size_select"
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                        fontSize === opt.id
                          ? 'border-accent bg-accent text-bg'
                          : 'border-border bg-surface text-text hover:bg-surface-hover'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Appearance — same wallpaper store as the shield menu. */}
              <div className="space-y-3 border-t border-border pt-5">
                <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                  Chat wallpaper
                </label>
                <WallpaperGrid current={wallpaper} onChoose={onChooseWallpaper} />
              </div>

              {/* Export & Local Cache */}
              <div className="space-y-2.5 border-t border-border pt-5">
                <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                  Data &amp; storage
                </h3>
                {onExportChat && (
                  <button
                    type="button"
                    disabled={Boolean(exportBlockedReason)}
                    onClick={onExportChat}
                    // TODO(telemetry-parity): switch to UiElement.CHAT_SETTINGS_EXPORT_CHAT once enabled on web.
                    data-track-exempt="disabled: pending telemetry web parity enablement for chat_settings.export_chat"
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover disabled:opacity-50 text-xs font-medium text-text cursor-pointer"
                  >
                    <span>{exportBlockedReason || 'Export current chat (.txt)'}</span>
                    <Download className={`${ICON_SECTION.section.rowIcon} text-text-secondary`} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClearCache?.();
                    showToast('Cleared temporary media cache.', 'success');
                  }}
                  // TODO(telemetry-parity): switch to UiElement.CHAT_SETTINGS_CLEAR_CACHE once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for chat_settings.clear_cache"
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-medium text-text cursor-pointer"
                >
                  <span>Clear decrypted media cache</span>
                  <Trash2 className={`${ICON_SECTION.section.rowIcon} text-text-secondary`} />
                </button>
              </div>

              {/* Help & Legal */}
              <div className="border-t border-border pt-4 flex flex-wrap gap-3 text-xs text-text-secondary">
                <a
                  href="/contact"
                  // TODO(telemetry-parity): switch to UiElement.SETTINGS_HELP_LINK once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for settings.help_link"
                  className="inline-flex items-center gap-1 hover:text-text underline"
                >
                  Help &amp; Support <ExternalLink className={ICON_SECTION.section.badgeIcon} />
                </a>
                <a
                  href="/privacy"
                  data-track-exempt="disabled: pending telemetry web parity enablement for settings.help_link"
                  className="inline-flex items-center gap-1 hover:text-text underline"
                >
                  Privacy <ExternalLink className={ICON_SECTION.section.badgeIcon} />
                </a>
                <a
                  href="/terms"
                  data-track-exempt="disabled: pending telemetry web parity enablement for settings.help_link"
                  className="inline-flex items-center gap-1 hover:text-text underline"
                >
                  Terms <ExternalLink className={ICON_SECTION.section.badgeIcon} />
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
