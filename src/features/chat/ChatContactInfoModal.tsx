/**
 * Chat Contact Info modal (mirrors iOS `ChatDetailViewController` Contact Info sheet/push):
 *  - Header with partner avatar, online/last-seen status, and quick actions (Call, Video, Search, Profile)
 *  - Shared Media / Links / Docs / Starred tabs extracted client-side from decrypted E2EE messages
 *  - Partner restriction aware Export Chat (.txt) & Media saving
 *  - Archive conversation (via `archiveHookAndSync`), Unhook, Block, and Report actions
 */
import { useMemo, useState } from 'react';
import {
  Archive,
  Ban,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Image as ImageIcon,
  Link2,
  Phone,
  Search,
  ShieldCheck,
  Star,
  UserCheck,
  UserMinus,
  Video,
  X,
} from 'lucide-react';
import { ModalDialog } from '../../components/common/ModalDialog';
import { MediaImage } from '../../components/common/MediaImage';
import { ICON_SECTION } from '../../lib/icon-tokens';
import { usePhotoLightbox } from '../../components/common/PhotoLightbox';
import { useToast } from '../../components/common/Toast';
import { decodeMessagePlaintext, type AttachmentEnvelope } from '../../lib/chat-attachments';
import type { AttachmentObjectUrlCache } from '../../lib/attachment-transport';
import {
  buildChatTranscript,
  EMPTY_PARTNER_RESTRICTIONS,
  extractUrls,
  formatMessageTime,
  PartnerRestrictionGate,
} from '../../lib/chat-timeline';
import { archiveHookAndSync, totalRemainingArchives, useArchiveStore } from '../../store/archive-store';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import type { ChatMessageView } from '../../types';
import type { PartnerChatRestrictions } from '../../api/rest';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';

type InfoTab = 'media' | 'links' | 'docs' | 'starred';

interface ExtractedMedia {
  messageId: string;
  timestamp: number;
  envelope: AttachmentEnvelope;
  url?: string;
}

interface ExtractedLink {
  messageId: string;
  timestamp: number;
  url: string;
  senderMine: boolean;
}

export function ChatContactInfoModal({
  open,
  onClose,
  matchId,
  peerName,
  peerPhoto,
  presenceText,
  messages,
  starredIds,
  attachmentCache,
  restrictions,
  onToggleStar,
  onJumpToMessage,
  onStartCall,
  onOpenSearch,
  onViewProfile,
  onOpenChatSettings,
  onUnhook,
  onBlock,
  onReport,
  onArchived,
}: {
  open: boolean;
  onClose: () => void;
  matchId: string;
  peerName: string;
  peerPhoto?: string | null;
  presenceText?: string | null;
  messages: readonly ChatMessageView[];
  starredIds: ReadonlySet<string>;
  attachmentCache: AttachmentObjectUrlCache;
  restrictions?: PartnerChatRestrictions | null;
  onToggleStar: (messageId: string) => void;
  onJumpToMessage: (messageId: string) => void;
  onStartCall?: (kind: 'AUDIO' | 'VIDEO') => void;
  onOpenSearch: () => void;
  onViewProfile: () => void;
  onOpenChatSettings: () => void;
  onUnhook: () => void;
  onBlock: () => void;
  onReport: () => void;
  onArchived?: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<InfoTab>('media');
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const listRes = useArchiveStore((s) => s.list);
  const allowance = listRes?.allowance ?? null;
  const remainingArchives = totalRemainingArchives(allowance);

  const effectiveRestrictions = restrictions ?? EMPTY_PARTNER_RESTRICTIONS;
  const canExport = PartnerRestrictionGate.canExportChat(effectiveRestrictions);
  const canSaveMedia = PartnerRestrictionGate.canSaveMedia(false, effectiveRestrictions);

  const { mediaItems, docItems, linkItems, starredItems } = useMemo(() => {
    const media: ExtractedMedia[] = [];
    const docs: ExtractedMedia[] = [];
    const links: ExtractedLink[] = [];
    const starred: { messageId: string; timestamp: number; preview: string }[] = [];

    for (const m of messages) {
      if (m.undecryptable) continue;
      const decoded = decodeMessagePlaintext(m.ciphertext);
      const id = m.messageId ?? String(m.timestamp);
      const mine = m.senderId === 'me';

      if (decoded?.type === 'attachment') {
        const url = attachmentCache.peek(decoded.envelope.objectKey);
        if (decoded.envelope.kind === 'image' || decoded.envelope.kind === 'video') {
          media.push({ messageId: id, timestamp: m.timestamp, envelope: decoded.envelope, url });
        } else {
          docs.push({ messageId: id, timestamp: m.timestamp, envelope: decoded.envelope, url });
        }
        if (starredIds.has(id)) {
          starred.push({
            messageId: id,
            timestamp: m.timestamp,
            preview: decoded.envelope.name || decoded.envelope.kind,
          });
        }
      } else {
        const text = decoded?.type === 'text' ? decoded.text : m.ciphertext;
        for (const url of extractUrls(text)) {
          links.push({ messageId: id, timestamp: m.timestamp, url, senderMine: mine });
        }
        if (starredIds.has(id)) {
          starred.push({ messageId: id, timestamp: m.timestamp, preview: text });
        }
      }
    }

    return {
      mediaItems: media.reverse(),
      docItems: docs.reverse(),
      linkItems: links.reverse(),
      starredItems: starred.reverse(),
    };
  }, [messages, attachmentCache, starredIds]);

  const resolvedPhotos = useMemo(
    () =>
      mediaItems
        .filter((item) => item.envelope.kind === 'image' && item.url)
        .map((item) => item.url as string),
    [mediaItems]
  );
  const { open: openLightbox, lightbox } = usePhotoLightbox({
    photos: resolvedPhotos,
    ownerName: peerName,
  });

  const handleExport = () => {
    if (!canExport) {
      showToast(PartnerRestrictionGate.exportNotice(peerName), 'error');
      return;
    }
    const transcript = buildChatTranscript(messages, peerName);
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${peerName.replace(/[^a-z0-9_-]/gi, '_') || 'onehook'}-chat.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    showToast('Chat transcript exported.', 'success');
  };

  const handleConfirmArchive = async () => {
    setArchiving(true);
    try {
      await archiveHookAndSync(matchId);
      setConfirmArchive(false);
      showToast(`Archived conversation with ${peerName}.`, 'success');
      await onArchived?.();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not archive right now.', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const tabs: { id: InfoTab; label: string; count: number }[] = [
    { id: 'media', label: 'Media', count: mediaItems.length },
    { id: 'links', label: 'Links', count: linkItems.length },
    { id: 'docs', label: 'Docs', count: docItems.length },
    { id: 'starred', label: 'Starred', count: starredItems.length },
  ];

  return (
    <>
      <ModalDialog open={open} onClose={onClose} label={`Contact info for ${peerName}`} className="max-w-lg w-full">
        <div className="flex flex-col max-h-[85vh]">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-base font-serif italic font-bold text-text">Contact info</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close contact info"
              {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
              className={ICON_SECTION.modalHeader.button}
            >
              <X className={ICON_SECTION.modalHeader.icon} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Hero */}
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-20 h-20 rounded-full overflow-hidden border border-border bg-surface">
                <MediaImage src={peerPhoto || FALLBACK_PROFILE_IMAGE} alt={peerName} className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-lg font-serif italic font-bold text-text">{peerName}</h3>
                {presenceText && <p className="text-xs text-text-secondary">{presenceText}</p>}
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-4 gap-2 w-full pt-2">
                <button
                  type="button"
                  disabled={!onStartCall}
                  onClick={() => {
                    onClose();
                    onStartCall?.('AUDIO');
                  }}
                  {...trackProps(UiElement.CHAT_CALL)}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover disabled:opacity-40 text-xs cursor-pointer"
                >
                  <Phone className={`${ICON_SECTION.section.rowIcon} text-accent`} />
                  <span>Audio</span>
                </button>
                <button
                  type="button"
                  disabled={!onStartCall}
                  onClick={() => {
                    onClose();
                    onStartCall?.('VIDEO');
                  }}
                  {...trackProps(UiElement.CHAT_VIDEO_CALL)}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover disabled:opacity-40 text-xs cursor-pointer"
                >
                  <Video className={`${ICON_SECTION.section.rowIcon} text-accent`} />
                  <span>Video</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSearch();
                  }}
                  // TODO(telemetry-parity): switch to UiElement.CHAT_SEARCH_OPEN once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for chat.search_open"
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs cursor-pointer"
                >
                  <Search className={`${ICON_SECTION.section.rowIcon} text-accent`} />
                  <span>Search</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewProfile();
                  }}
                  {...trackProps(UiElement.CHAT_PROFILE_OPEN)}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs cursor-pointer"
                >
                  <UserCheck className={`${ICON_SECTION.section.rowIcon} text-accent`} />
                  <span>Profile</span>
                </button>
              </div>
            </div>

            {/* Partner restrictions notice */}
            {restrictions && (restrictions.saveMedia || restrictions.export || restrictions.mrOneHook) && (
              <div className="p-3 rounded-xl border border-border bg-surface text-xs text-text-secondary flex items-start gap-2.5">
                <ShieldCheck className={`${ICON_SECTION.section.rowIcon} text-accent mt-0.5`} aria-hidden="true" />
                <div>
                  <p className="font-semibold text-text">Conversation restrictions set by {peerName}</p>
                  <p className="text-[11px] mt-0.5">
                    {[
                      restrictions.saveMedia ? 'Saving their media is turned off' : null,
                      restrictions.export ? 'Exporting transcript is turned off' : null,
                      restrictions.mrOneHook ? 'Sharing their context with Mr.OneHook is turned off' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            )}

            {/* Shared items tabs */}
            <div className="space-y-3">
              <div
                role="tablist"
                aria-label="Shared items"
                className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-surface border border-border"
              >
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    // TODO(telemetry-parity): switch to UiElement.CHAT_MEDIA_LIBRARY_TAB once enabled on web.
                    data-track-exempt="disabled: pending telemetry web parity enablement for chat.media_library_tab"
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      tab === t.id ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {t.label} ({t.count})
                  </button>
                ))}
              </div>

              {tab === 'media' && (
                mediaItems.length === 0 ? (
                  <p className="text-xs text-text-secondary py-6 text-center">No shared photos or videos yet.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {mediaItems.map((item) => {
                      const photoIndex = item.url ? resolvedPhotos.indexOf(item.url) : -1;
                      return (
                        <button
                          key={item.messageId}
                          type="button"
                          onClick={() => {
                            if (photoIndex >= 0) openLightbox(photoIndex);
                            else {
                              onClose();
                              onJumpToMessage(item.messageId);
                            }
                          }}
                          {...trackProps(UiElement.CHAT_MEDIA_OPEN)}
                          className="aspect-square rounded-xl border border-border bg-surface overflow-hidden relative flex items-center justify-center cursor-pointer"
                        >
                          {item.url && item.envelope.kind === 'image' ? (
                            <img src={item.url} alt={item.envelope.name} className="w-full h-full object-cover" />
                          ) : item.envelope.thumbnail ? (
                            <img
                              src={`data:image/jpeg;base64,${item.envelope.thumbnail}`}
                              alt={item.envelope.name}
                              className="w-full h-full object-cover blur-sm"
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-text-muted" />
                          )}
                          {!canSaveMedia && (
                            <span className="sr-only">Saving disabled by peer</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {tab === 'links' && (
                linkItems.length === 0 ? (
                  <p className="text-xs text-text-secondary py-6 text-center">No links shared yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {linkItems.map((item, idx) => (
                      <li key={`${item.messageId}-${idx}`} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-surface">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          // TODO(telemetry-parity): switch to UiElement.CHAT_LINK_OPEN once enabled on web.
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.link_open"
                          className="flex items-center gap-2 text-xs text-accent hover:underline truncate min-w-0"
                        >
                          <Link2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onJumpToMessage(item.messageId);
                          }}
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.link_open"
                          className="text-[11px] text-text-secondary hover:text-text shrink-0 cursor-pointer"
                        >
                          {formatMessageTime(item.timestamp)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {tab === 'docs' && (
                docItems.length === 0 ? (
                  <p className="text-xs text-text-secondary py-6 text-center">No documents or voice notes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {docItems.map((item) => (
                      <li key={item.messageId}>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onJumpToMessage(item.messageId);
                          }}
                          {...trackProps(UiElement.CHAT_FILE_OPEN)}
                          className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-accent shrink-0" />
                            <span className="text-xs font-medium text-text truncate">{item.envelope.name || item.envelope.kind}</span>
                          </span>
                          <span className="text-[11px] text-text-muted shrink-0">
                            {formatMessageTime(item.timestamp)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {tab === 'starred' && (
                starredItems.length === 0 ? (
                  <p className="text-xs text-text-secondary py-6 text-center">No starred messages yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {starredItems.map((item) => (
                      <li key={item.messageId} className="p-2.5 rounded-xl border border-border bg-surface flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onJumpToMessage(item.messageId);
                          }}
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.media_star"
                          className="flex-1 text-left text-xs text-text line-clamp-2 cursor-pointer"
                        >
                          {item.preview}
                          <span className="block text-[10px] text-text-muted mt-0.5">{formatMessageTime(item.timestamp)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleStar(item.messageId)}
                          aria-label="Unstar message"
                          // TODO(telemetry-parity): switch to UiElement.CHAT_MEDIA_STAR once enabled on web.
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.media_star"
                          className="p-1 text-amber-500 hover:opacity-70 cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

            {/* Settings, Export, Safety */}
            <div className="border-t border-border pt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenChatSettings();
                }}
                {...trackProps(UiElement.CHAT_SETTINGS_OPEN)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-medium text-text cursor-pointer"
              >
                <span>Chat settings &amp; encryption</span>
                <ShieldCheck className={`${ICON_SECTION.section.rowIcon} text-accent`} />
              </button>

              <button
                type="button"
                onClick={handleExport}
                // TODO(telemetry-parity): switch to UiElement.CHAT_EXPORT_OPEN once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.export_open"
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-medium text-text cursor-pointer"
              >
                <span>{canExport ? 'Export chat (.txt)' : `Export chat (restricted by ${peerName})`}</span>
                <Download className={`${ICON_SECTION.section.rowIcon} text-text-secondary`} />
              </button>

              <button
                type="button"
                onClick={() => setConfirmArchive(true)}
                // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVE_OPEN once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.archive_open"
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-medium text-text cursor-pointer"
              >
                <span>Archive conversation</span>
                <Archive className={`${ICON_SECTION.section.rowIcon} text-accent`} />
              </button>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onUnhook();
                  }}
                  // TODO(telemetry-parity): switch to UiElement.CHAT_UNMATCH once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for chat.unmatch"
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-xs font-semibold text-text hover:bg-surface-hover cursor-pointer"
                >
                  <UserMinus className={ICON_SECTION.section.actionIcon} />
                  Unhook
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReport();
                  }}
                  {...trackProps(UiElement.CHAT_REPORT_OPEN)}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-amber-500/30 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/5 cursor-pointer"
                >
                  <Flag className={ICON_SECTION.section.actionIcon} />
                  Report
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onBlock();
                  }}
                  {...trackProps(UiElement.CHAT_BLOCK_OPEN)}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-500/30 text-xs font-semibold text-red-500 hover:bg-red-500/5 cursor-pointer"
                >
                  <Ban className={ICON_SECTION.section.actionIcon} />
                  Block
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalDialog>

      {/* Confirm Archive */}
      <ModalDialog open={confirmArchive} onClose={() => setConfirmArchive(false)} label="Archive this hook?">
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <h3 className="text-base font-serif italic font-bold text-text">Archive conversation with {peerName}?</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              This frees up a hook slot now and preserves your history read-only. You can ask to continue later.
              {allowance ? ` (${remainingArchives} archive${remainingArchives === 1 ? '' : 's'} remaining)` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmArchive(false)}
              {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
              className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-text cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={archiving}
              onClick={() => void handleConfirmArchive()}
              // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVE_CONFIRM once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.archive_confirm"
              className="flex-1 py-2 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              {archiving ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </div>
      </ModalDialog>

      {lightbox}
    </>
  );
}
