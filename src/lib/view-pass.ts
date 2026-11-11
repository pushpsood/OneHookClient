/**
 * View passes (docs/chat-only-profiles.md §7.8, implementation contract §1).
 *
 * No profile is readable by user id alone. Another member's profile or media opens only with a short
 * lived pass (compact ES256 JWS, 10 minutes, at most 25 targets) sent as `X-View-Pass`:
 *
 *  - aud `profile.chat`: from State — `GET /state/{me}`.chatViewPass (every current hook partner) and
 *    `GET /state/hook-requests?direction=INCOMING`.chatViewPass (senders of unlocked requests).
 *  - aud `profile.matching`: from Matching — the `viewPass` of a discover page or of `GET /matching/likes`,
 *    or `POST /matching/view-passes {targetIds}` to re-issue one.
 *
 * Profile verifies the signature; the client only decodes the payload to know which pass names whom
 * and when it expires (routing, not security). A missing, expired or refused pass answers the same 404
 * as an unknown member, so on a 404 the caller refreshes the pass once and retries.
 */

export type ViewPassAudience = 'profile.chat' | 'profile.matching';

export interface DecodedViewPass {
  token: string;
  aud: ViewPassAudience;
  /** The viewer (JWT sub) the pass is bound to. */
  sub?: string;
  /** Members the pass names. */
  tgt: string[];
  /** Epoch seconds. */
  exp: number;
}

function base64UrlDecode(segment: string): string {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Decodes a pass's payload. Returns null for anything that is not a well-formed view pass. */
export function decodeViewPass(token: string | null | undefined): DecodedViewPass | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    const aud = payload.aud;
    if (aud !== 'profile.chat' && aud !== 'profile.matching') return null;
    const tgt = Array.isArray(payload.tgt) ? payload.tgt.filter((t): t is string => typeof t === 'string') : [];
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;
    return { token, aud, sub: typeof payload.sub === 'string' ? payload.sub : undefined, tgt, exp };
  } catch {
    return null;
  }
}

/** A pass is used only while it has at least this many seconds left, so it cannot expire in flight. */
const EXPIRY_MARGIN_SECONDS = 20;

export class ViewPassStore {
  private passes: DecodedViewPass[] = [];

  constructor(private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000)) {}

  /** Remembers a pass (ignores malformed ones). The newest pass for a target wins. */
  add(token: string | null | undefined): void {
    const decoded = decodeViewPass(token);
    if (!decoded) return;
    const now = this.nowSeconds();
    this.passes = [decoded, ...this.passes.filter((p) => p.token !== decoded.token && p.exp > now)];
  }

  /** The newest unexpired pass of this audience naming `targetId`, if any. */
  passFor(aud: ViewPassAudience, targetId: string): string | undefined {
    const now = this.nowSeconds();
    return this.passes.find((p) => p.aud === aud && p.exp - EXPIRY_MARGIN_SECONDS > now && p.tgt.includes(targetId))
      ?.token;
  }

  /** Drops every pass (sign-out, or matching turned off for `profile.matching`). */
  clear(aud?: ViewPassAudience): void {
    this.passes = aud ? this.passes.filter((p) => p.aud !== aud) : [];
  }
}

/** The app-wide store. */
export const viewPasses = new ViewPassStore();

/**
 * Fetches fresh passes naming `targetIds` (State for chat, Matching for matching). Registered by the
 * app shell, because what may be called depends on the member's matching mode.
 */
export type ViewPassRefresher = (targetIds: string[]) => Promise<void>;

const refreshers: Partial<Record<ViewPassAudience, ViewPassRefresher>> = {};

export function setViewPassRefresher(aud: ViewPassAudience, refresher: ViewPassRefresher | undefined): void {
  if (refresher) refreshers[aud] = refresher;
  else delete refreshers[aud];
}

/** Asks the registered refresher for fresh passes naming `targetIds` (no-op when none is registered). */
export async function refreshViewPass(aud: ViewPassAudience, targetIds: string[]): Promise<void> {
  const refresher = refreshers[aud];
  if (refresher) await refresher(targetIds);
}

/**
 * Coalesces refresh requests made in the same moment (a page of cards all opening at once) into
 * batched calls of at most `maxTargets` ids, so one expiry costs one request rather than one per card.
 */
export function batchRefresher(
  fetchPasses: (targetIds: string[]) => Promise<void>,
  maxTargets = 25,
  windowMs = 25
): ViewPassRefresher {
  let pending: { ids: Set<string>; done: Promise<void> } | null = null;
  return (targetIds: string[]) => {
    if (!pending) {
      const ids = new Set<string>();
      const done = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          pending = null;
          const all = [...ids];
          const chunks: string[][] = [];
          for (let i = 0; i < all.length; i += maxTargets) chunks.push(all.slice(i, i + maxTargets));
          Promise.all(chunks.map((c) => fetchPasses(c))).then(() => resolve(), reject);
        }, windowMs);
      });
      pending = { ids, done };
    }
    for (const id of targetIds) pending.ids.add(id);
    return pending.done;
  };
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; $metadata?: { httpStatusCode?: number } };
  return e.status === 404 || e.$metadata?.httpStatusCode === 404;
}

/**
 * Runs `read` with the pass for `targetId`, fetching one first when none is held, and refreshing it
 * once (then retrying once) when the read answers 404. Any other failure, or a second 404, propagates.
 */
export async function withViewPass<T>(
  aud: ViewPassAudience,
  targetId: string,
  read: (pass: string | undefined) => Promise<T>,
  store: ViewPassStore = viewPasses
): Promise<T> {
  let refreshed = false;
  const refresh = async () => {
    refreshed = true;
    await refreshViewPass(aud, [targetId]);
  };
  if (!store.passFor(aud, targetId)) await refresh();
  try {
    return await read(store.passFor(aud, targetId));
  } catch (err) {
    if (!isNotFound(err) || refreshed) throw err;
    await refresh();
    return read(store.passFor(aud, targetId));
  }
}

/** Who owns a private media key and which profile it belongs to (`media/{u}/{chat|matching}/...`). */
export function mediaKeyOwner(key: string): { ownerId: string; aud: ViewPassAudience | null } | null {
  const m = /^(?:media|pending)\/([^/]+)\/(?:(chat|matching)\/)?/.exec(key);
  if (!m) return null;
  const aud: ViewPassAudience | null = m[2] === 'chat' ? 'profile.chat' : m[2] === 'matching' ? 'profile.matching' : null;
  return { ownerId: m[1], aud };
}
