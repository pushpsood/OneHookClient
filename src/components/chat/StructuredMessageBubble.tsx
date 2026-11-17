import { useState } from 'react';
import { AlertTriangle, CircleStop, Download, Mail, MapPin, Navigation, Phone } from 'lucide-react';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import type {
  ContactContent,
  LiveLocationContent,
  LocationContent,
  StructuredContent,
} from '../../lib/chat-structured';
import {
  formatClockTime,
  formatUpdatedAgo,
  latestPinPerMember,
  liveSessionKey,
  resolveLiveBubble,
  type LiveSessions,
} from '../../lib/live-location';
import {
  distanceMeters,
  formatAccuracy,
  formatCoordinatesForDisplay,
  formatDistance,
  mapsDirectionsUrl,
  mapsOpenUrl,
  projectPins,
  type MapTarget,
  type MapsApp,
} from '../../lib/map-links';
import { buildVCard, vCardFileName } from '../../lib/vcard';
import { TAB_BOUND_COPY } from '../../lib/live-location-sharing';
import { useNow } from '../../hooks/use-live-locations';

/**
 * Renders a structured-content message (OneHookBackend/docs/chat-location-contact.md): a current
 * location, a live-location share or a contact card, from either member. The member's own running
 * live share has a Stop button.
 *
 * PRIVACY: nothing here talks to a network. Maps are drawn on device as a tile-free card; the only way
 * coordinates leave the device is a link the user taps, to the maps app they picked. The vCard is built
 * locally from the decrypted card.
 */

/** Live-share state for the conversation, from `useLiveLocations`. */
export interface LiveLocationContext {
  sessions: LiveSessions;
  loadedAt?: number;
  /** The signed-in member's real user id (messages from them carry the `'me'` sender alias). */
  currentUserId: string;
  peerId?: string;
  peerName: string;
  /**
   * Stops one of the member's own shares (this tab's, or one started on another device: the backend
   * lets the owner stop any of theirs). Own live bubbles show a Stop button when present.
   */
  onStopShare?: (sessionId: string) => void;
  /** The sessionId of the share this tab is running in the conversation, if any. */
  sharingHereSessionId?: string;
}

interface StructuredMessageBubbleProps {
  content: StructuredContent;
  mine: boolean;
  /** Server timestamp of the message (epoch ms). */
  sentAt: number;
  live: LiveLocationContext;
}

export const UNSUPPORTED_CONTENT_COPY = 'Update OneHook to view this';

export function StructuredMessageBubble({ content, mine, sentAt, live }: StructuredMessageBubbleProps) {
  switch (content.type) {
    case 'location':
      return <LocationCard location={content} />;
    case 'live_location':
      return <LiveLocationCard start={content} mine={mine} sentAt={sentAt} live={live} />;
    case 'contact':
      return <ContactCard contact={content} />;
    default:
      return (
        <div className="flex items-center gap-2 text-xs italic opacity-80">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{UNSUPPORTED_CONTENT_COPY}</span>
        </div>
      );
  }
}

// ── Shared pieces ────────────────────────────────────────────────────────────

const ACTION_CLASS =
  'inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-black hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current rounded';

const MAPS_APPS: readonly { app: MapsApp; label: string }[] = [
  { app: 'apple_maps', label: 'Apple Maps' },
  { app: 'google_maps', label: 'Google Maps' },
];

/** Open + directions links for one position. Each link hands the coordinates to that maps app only. */
function MapActions({ target, subject }: { target: MapTarget; subject: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10px] opacity-60">Open in</span>
        {MAPS_APPS.map(({ app, label }) => (
          <a
            key={app}
            href={mapsOpenUrl(app, target)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${subject} in ${label}`}
            title={`Opens in ${label}`}
            {...trackProps(UiElement.CHAT_LOCATION_OPEN, { value: app })}
            className={ACTION_CLASS}
          >
            <MapPin className="w-3 h-3" aria-hidden="true" />
            {label}
          </a>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10px] opacity-60">Directions</span>
        {MAPS_APPS.map(({ app, label }) => (
          <a
            key={app}
            href={mapsDirectionsUrl(app, target)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Directions to ${subject} in ${label}`}
            title={`Opens in ${label}`}
            {...trackProps(UiElement.CHAT_LOCATION_DIRECTIONS, { value: app })}
            className={ACTION_CLASS}
          >
            <Navigation className="w-3 h-3" aria-hidden="true" />
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

/** Stated once per card, as the contract asks: the link shares the location with that app. */
function MapsHint({ live }: { live?: boolean }) {
  return (
    <p className="text-[10px] opacity-60 leading-snug">
      {live
        ? 'Opens in Apple Maps or Google Maps, which then receive the latest position as a snapshot. They do not follow the share.'
        : 'Opens in Apple Maps or Google Maps, which then receive this location.'}
    </p>
  );
}

interface PlotPin {
  key: string;
  lat: number;
  lon: number;
  label: string;
  live?: boolean;
}

const PLOT_W = 240;
const PLOT_H = 120;

/** Tile-free on-device map: a grid with the pins at their relative positions. */
function PinPlot({ pins }: { pins: PlotPin[] }) {
  const points = projectPins(pins, PLOT_W, PLOT_H, 24);
  const distance =
    pins.length === 2 ? formatDistance(distanceMeters(pins[0], pins[1])) : null;
  return (
    <svg
      viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
      className="w-full max-w-[16rem] h-auto rounded-lg bg-current/5 border border-current/15"
      role="img"
      aria-label={
        distance
          ? `${pins[0].label} and ${pins[1].label} are about ${distance} apart`
          : `Pin for ${pins.map((p) => p.label).join(', ')}`
      }
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <line key={`v${i}`} x1={(PLOT_W / 6) * i} y1={0} x2={(PLOT_W / 6) * i} y2={PLOT_H} stroke="currentColor" strokeOpacity={0.08} />
      ))}
      {[1, 2].map((i) => (
        <line key={`h${i}`} x1={0} y1={(PLOT_H / 3) * i} x2={PLOT_W} y2={(PLOT_H / 3) * i} stroke="currentColor" strokeOpacity={0.08} />
      ))}
      {points.length === 2 && (
        <line
          x1={points[0].x}
          y1={points[0].y}
          x2={points[1].x}
          y2={points[1].y}
          stroke="currentColor"
          strokeOpacity={0.4}
          strokeDasharray="4 4"
        />
      )}
      {points.map((p, i) => (
        <g key={pins[i].key}>
          <circle cx={p.x} cy={p.y} r={7} fill="currentColor" fillOpacity={pins[i].live ? 0.25 : 0.15} />
          <circle cx={p.x} cy={p.y} r={3.5} fill="currentColor" />
          <text x={p.x} y={p.y - 11} textAnchor="middle" fontSize={9} fill="currentColor">
            {pins[i].label}
          </text>
        </g>
      ))}
      {distance && points.length === 2 && (
        <text
          x={(points[0].x + points[1].x) / 2}
          y={(points[0].y + points[1].y) / 2 + 14}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          fillOpacity={0.7}
        >
          {distance}
        </text>
      )}
    </svg>
  );
}

/**
 * The pin tile. Tapping it expands the in-app (on-device) map; that expansion is the `in_app` open.
 * Collapsing is not an open, so the event is emitted imperatively on expand only.
 */
function PinTile({
  expanded,
  onToggle,
  live,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  live?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!expanded) trackUi(UiElement.CHAT_LOCATION_OPEN, { value: 'in_app' });
        onToggle();
      }}
      aria-expanded={expanded}
      aria-label={expanded ? `Hide map for ${label}` : `Show map for ${label}`}
      data-track-exempt="duplicate: expanding emits chat.location_open (in_app) via trackUi; collapsing is not an open"
      className="relative w-12 h-12 shrink-0 rounded-xl border border-current/30 bg-current/10 flex items-center justify-center hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
    >
      <MapPin className="w-6 h-6" aria-hidden="true" />
      {live && (
        <span className="absolute top-1 right-1 flex w-2.5 h-2.5" aria-hidden="true">
          <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-green-500" />
        </span>
      )}
    </button>
  );
}

// ── Current location ─────────────────────────────────────────────────────────

export function LocationCard({ location }: { location: LocationContent }) {
  const [expanded, setExpanded] = useState(false);
  const coordinates = formatCoordinatesForDisplay(location.lat, location.lon);
  const title = location.name ?? 'Location';
  const target: MapTarget = { lat: location.lat, lon: location.lon, name: location.name };
  return (
    <div className="space-y-3 min-w-[14rem]">
      <div className="flex items-start gap-3">
        <PinTile expanded={expanded} onToggle={() => setExpanded((v) => !v)} label={title} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold break-words">{title}</p>
          {location.address && <p className="text-xs opacity-80 break-words">{location.address}</p>}
          {!location.name && !location.address && (
            <p className="text-xs opacity-80 tabular-nums">{coordinates}</p>
          )}
          {location.accuracyM !== undefined && (
            <p className="text-[10px] opacity-60">Accuracy {formatAccuracy(location.accuracyM)}</p>
          )}
        </div>
      </div>
      {expanded && (
        <div className="space-y-1">
          <PinPlot pins={[{ key: 'location', lat: location.lat, lon: location.lon, label: title }]} />
          <p className="text-[10px] opacity-70 tabular-nums">{coordinates}</p>
        </div>
      )}
      <MapActions target={target} subject={title} />
      <MapsHint />
    </div>
  );
}

// ── Live location ────────────────────────────────────────────────────────────

function LiveLocationCard({
  start,
  mine,
  sentAt,
  live,
}: {
  start: LiveLocationContent;
  mine: boolean;
  sentAt: number;
  live: LiveLocationContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const ownerId = mine ? live.currentUserId : live.peerId;
  // A share is matched to its bubble by owner AND sessionId, so nobody can move another member's pin.
  const session = ownerId ? live.sessions[liveSessionKey(ownerId, start.sessionId)] : undefined;
  const initial = resolveLiveBubble({ start, session, sentAt, loadedAt: live.loadedAt, now: Date.now() });
  const now = useNow(15_000, initial.status === 'live');
  const view = resolveLiveBubble({ start, session, sentAt, loadedAt: live.loadedAt, now });
  const ownerLabel = mine ? 'You' : live.peerName;
  const subject = mine ? 'your live location' : `${live.peerName}'s live location`;

  if (view.status === 'ended') {
    // The share is over: its live position is gone, so the card shows no coordinates or map links.
    return (
      <div className="flex items-center gap-3 min-w-[14rem]">
        <div className="w-12 h-12 shrink-0 rounded-xl border border-current/20 flex items-center justify-center opacity-60" aria-hidden="true">
          <MapPin className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-bold">Live location</p>
          <p className="text-xs opacity-70">Ended</p>
        </div>
      </div>
    );
  }

  // Both members' running shares, one pin each (newest `at`), plus this bubble's own pin.
  const pins: PlotPin[] = [
    { key: 'this', lat: view.lat, lon: view.lon, label: ownerLabel, live: true },
  ];
  const otherShares = Object.values(latestPinPerMember(live.sessions, now)).filter(
    (s) => s.userId !== ownerId
  );
  for (const other of otherShares) {
    const label = other.userId === live.currentUserId ? 'You' : live.peerName;
    pins.push({ key: other.userId, lat: other.position.lat, lon: other.position.lon, label, live: true });
  }

  return (
    <div className="space-y-3 min-w-[14rem]">
      <div className="flex items-start gap-3">
        <PinTile expanded={expanded} onToggle={() => setExpanded((v) => !v)} live label={subject} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Live location</p>
          <p className="text-xs opacity-80">Live until {formatClockTime(view.expiresAt, now)}</p>
          <p className="text-[10px] opacity-60">
            Updated {formatUpdatedAgo(view.updatedAt, now)}
            {view.accuracyM !== undefined ? ` · ${formatAccuracy(view.accuracyM)}` : ''}
          </p>
        </div>
      </div>
      {expanded && (
        <div className="space-y-2">
          <PinPlot pins={pins} />
          <p className="text-[10px] opacity-70 tabular-nums">
            {ownerLabel}: {formatCoordinatesForDisplay(view.lat, view.lon)}
          </p>
          {otherShares.map((other) => {
            const label = other.userId === live.currentUserId ? 'You' : live.peerName;
            return (
              <div key={other.userId} className="space-y-1.5 border-t border-current/15 pt-2">
                <p className="text-[10px] opacity-70 tabular-nums">
                  {label} (also sharing): {formatCoordinatesForDisplay(other.position.lat, other.position.lon)}
                  {' · '}updated {formatUpdatedAgo(other.position.updatedAt, now)}
                </p>
                <MapActions
                  target={{ lat: other.position.lat, lon: other.position.lon }}
                  subject={label === 'You' ? 'your live location' : `${label}'s live location`}
                />
              </div>
            );
          })}
        </div>
      )}
      <MapActions target={{ lat: view.lat, lon: view.lon }} subject={subject} />
      <MapsHint live />
      {mine && live.onStopShare && (
        <div className="space-y-1 border-t border-current/15 pt-2">
          {live.sharingHereSessionId === start.sessionId && (
            <p className="text-[10px] opacity-70 leading-snug">{TAB_BOUND_COPY}</p>
          )}
          <button
            type="button"
            onClick={() => live.onStopShare?.(start.sessionId)}
            aria-label="Stop sharing your live location"
            {...trackProps(UiElement.CHAT_LIVE_LOCATION_STOP)}
            className={ACTION_CLASS}
          >
            <CircleStop className="w-3.5 h-3.5" aria-hidden="true" />
            Stop sharing
          </button>
        </div>
      )}
    </div>
  );
}

// ── Contact ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
  return letters.map((p) => Array.from(p)[0] ?? '').join('').toUpperCase() || '?';
}

/** Downloads the vCard. Built on device; the object URL is revoked right after the click. */
function downloadVCard(contact: ContactContent): void {
  const blob = new Blob([buildVCard(contact)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = vCardFileName(contact.displayName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ContactCard({ contact }: { contact: ContactContent }) {
  return (
    <div className="space-y-3 min-w-[14rem]">
      <div className="flex items-center gap-3">
        {contact.thumbnailBase64 ? (
          <img
            src={`data:image/jpeg;base64,${contact.thumbnailBase64}`}
            alt=""
            aria-hidden="true"
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full shrink-0 bg-current/15 flex items-center justify-center text-sm font-black"
            aria-hidden="true"
          >
            {initials(contact.displayName)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold break-words">{contact.displayName}</p>
          {contact.organization && <p className="text-xs opacity-70 break-words">{contact.organization}</p>}
        </div>
      </div>
      {(contact.phones.length > 0 || contact.emails.length > 0) && (
        <ul className="space-y-1 text-xs">
          {contact.phones.map((phone, i) => (
            <li key={`p${i}`} className="flex items-center gap-2 min-w-0">
              <Phone className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
              {phone.label && <span className="opacity-60 shrink-0">{phone.label}</span>}
              <span className="select-all break-all tabular-nums">{phone.value}</span>
            </li>
          ))}
          {contact.emails.map((email, i) => (
            <li key={`e${i}`} className="flex items-center gap-2 min-w-0">
              <Mail className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
              {email.label && <span className="opacity-60 shrink-0">{email.label}</span>}
              <span className="select-all break-all">{email.value}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => downloadVCard(contact)}
        {...trackProps(UiElement.CHAT_CONTACT_OPEN)}
        className={ACTION_CLASS}
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Download .vcf
      </button>
    </div>
  );
}
