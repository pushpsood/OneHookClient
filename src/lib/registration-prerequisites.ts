import type { HistoryState, WrapMethod } from '../api/chat';

/**
 * Whether an account actually got the guarantees that made sign-up app-only.
 *
 * Sign-up was moved into the native apps for one reason (see `config/signup.config.ts` and
 * OneHookBackend `docs/account-key-recovery.md` §3): the first device creates the account history key
 * (AHK), and only an app can put a copy into **platform escrow** — iCloud Keychain or Android Block
 * Store. Native sign-up therefore writes a wrap set of *platform escrow + PRF (passkey) + this
 * device*, which is what makes every account start with two independent holders before it has any
 * history to lose. That is the property that lets OneHook ship without asking users to keep a
 * recovery code.
 *
 * The web app cannot create either of those two holders, so if it let a half-registered user finish
 * onboarding here, that account would carry exactly one holder — on a platform with no escrow. That
 * is precisely the single point of failure the whole design removes, and it would be silent: nothing
 * breaks until the user loses their device, at which point their history is gone for good.
 *
 * So web onboarding checks the guarantee rather than assuming it, and sends anyone missing it back to
 * the app to finish. This is a *verification*, not a second gate on sign-up.
 */

/** A prerequisite that only the native sign-up flow can satisfy. */
export type MissingPrerequisite = 'EPOCH' | 'ESCROW' | 'PRF';

export interface PrerequisiteResult {
  satisfied: boolean;
  /** Which required guarantees are absent, for an explanation the user can act on. */
  missing: MissingPrerequisite[];
  /**
   * Absent guarantees that do NOT block onboarding (currently PRF). Surfaced so the account can be
   * strengthened later without pretending it is broken now.
   */
  recommended: MissingPrerequisite[];
}

/**
 * The holder native sign-up is required to write.
 *
 * Only `ESCROW` is required, and that is a deliberate, narrow choice:
 *
 * * `ESCROW` is the one holder the web genuinely cannot create — it means a copy of the key sits in
 *   iCloud Keychain or Android Block Store. Requiring it is therefore a real test of "this account was
 *   created in an app", which is the whole reason sign-up is native.
 * * `PRF` (a passkey-bound wrap) is **not** required, because no client writes one yet: Apple's PRF API
 *   needs iOS 18 while the app still targets 17, and existing passkeys were created without the
 *   extension. Requiring it would block every real user for a rung that cannot yet exist. It is treated
 *   as a recommendation instead, and should be promoted to required once native writes it.
 * * `DEVICE` is never accepted as evidence: every platform writes one at sign-in, so it says nothing
 *   about how the account was created.
 *
 * Typed as the overlap of both unions, so this stops compiling if a required wrap is removed from
 * `WrapMethod` or from the reported prerequisites, rather than silently checking nothing.
 */
const REQUIRED_WRAPS: Extract<MissingPrerequisite, WrapMethod>[] = ['ESCROW'];

/** Holders that strengthen an account but are not yet enforced. See `REQUIRED_WRAPS`. */
const RECOMMENDED_WRAPS: Extract<MissingPrerequisite, WrapMethod>[] = ['PRF'];

/**
 * Evaluates a `GET /chat/history` response against the app-only guarantees.
 *
 * Only the ACTIVE epoch's wraps count. A wrap against a superseded epoch cannot open current history,
 * so treating it as satisfaction would pass an account that is, in practice, unprotected.
 */
export function evaluateRegistrationPrerequisites(
  state: HistoryState | null | undefined
): PrerequisiteResult {
  // No response, or no epoch: the AHK was never established, so registration did not finish.
  if (!state || !state.epochs || state.epochs.length === 0) {
    return { satisfied: false, missing: ['EPOCH', ...REQUIRED_WRAPS], recommended: [...RECOMMENDED_WRAPS] };
  }

  const activeEpoch =
    state.activeEpoch ?? state.epochs.reduce((highest, e) => Math.max(highest, e.epoch), 0);
  if (!activeEpoch || !state.epochs.some((epoch) => epoch.epoch === activeEpoch)) {
    return { satisfied: false, missing: ['EPOCH', ...REQUIRED_WRAPS], recommended: [...RECOMMENDED_WRAPS] };
  }

  const methodsOnActiveEpoch = new Set(
    (state.wraps ?? []).filter((wrap) => wrap.epoch === activeEpoch).map((wrap) => wrap.method)
  );
  const missing = REQUIRED_WRAPS.filter((method) => !methodsOnActiveEpoch.has(method));
  const recommended = RECOMMENDED_WRAPS.filter((method) => !methodsOnActiveEpoch.has(method));

  return { satisfied: missing.length === 0, missing, recommended };
}

/** Human wording for what is still needed, used by the "finish in the app" screen. */
export function describeMissingPrerequisites(missing: MissingPrerequisite[]): string[] {
  const reasons: string[] = [];
  if (missing.includes('EPOCH')) {
    reasons.push('Your account’s history key hasn’t been created yet.');
  }
  if (missing.includes('ESCROW')) {
    reasons.push(
      'A backup of that key hasn’t been saved to your iCloud Keychain or Android Block Store — only the app can do this.'
    );
  }
  if (missing.includes('PRF')) {
    reasons.push('No passkey is protecting your key yet.');
  }
  return reasons;
}
