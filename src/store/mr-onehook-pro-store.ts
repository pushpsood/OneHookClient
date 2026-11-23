/**
 * The member's Mr OneHook plan and Pro subscription (`GET /api/member/mr-onehook-pro`), shared by every
 * Mr OneHook surface: the in-app chat (tabs, attachments), "Ask Mr OneHook" in a match chat, Settings
 * and the Pro screen (`MrOneHookProSheet`, mounted once by AppContent and opened with
 * {@link openMrOneHookPro}).
 *
 * `availability`:
 *   • `unknown` / `loading` — not read yet: Pro entry points stay hidden, Free limits apply.
 *   • `ready`  — `status` is the server's answer.
 *   • `off`    — 404 `ENDPOINT_NOT_FOUND`: Pro is off in this environment; every Pro entry point hides.
 *   • `error`  — the read failed; Free limits apply and entry points stay hidden until a retry works.
 *
 * Every write goes through the generated `mrOneHookClient`; purchases and "Keep Pro" send a fresh
 * UUID `Idempotency-Key` per tap, so a retried request never charges twice.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type {
  MrOneHookPlan,
  MrOneHookProStatus,
  ProBillingPeriod,
} from 'onehook-mr-onehook-client';
import { mrOneHookClient, sdkFailure, withoutMetadata } from '../api/external-sdk-clients';
import { classifyProError, type ProProblem } from '../lib/mr-onehook-contract';
import { mrOneHookPlanContext, type MrOneHookPlanContext } from '../lib/mr-onehook-pro';
import { getCognitoAuth } from '../lib/cognito-auth';
import { refreshUserStateInStore } from '../hooks/use-api';

export type MrOneHookProAvailability = 'unknown' | 'loading' | 'ready' | 'off' | 'error';

interface MrOneHookProState {
  /** The member the status belongs to (so a sign-out or account switch never shows stale data). */
  userId?: string;
  status: MrOneHookProStatus | null;
  availability: MrOneHookProAvailability;
  sheetOpen: boolean;
}

export const useMrOneHookProStore = create<MrOneHookProState>(() => ({
  status: null,
  availability: 'unknown',
  sheetOpen: false,
}));

/** The member's plan context (plan, limits, whether Pro entry points show); loads it once per member. */
export function useMrOneHookPro(
  userId: string | undefined
): MrOneHookPlanContext & { status: MrOneHookProStatus | null } {
  const status = useMrOneHookProStore((s) => s.status);
  const availability = useMrOneHookProStore((s) => s.availability);
  useEffect(() => {
    if (userId) void loadMrOneHookPro(userId);
  }, [userId]);
  return { ...mrOneHookPlanContext(status, availability), status };
}

export type ProActionResult = { ok: true } | { ok: false; problem: ProProblem };

function failure(err: unknown): ProActionResult {
  const f = sdkFailure(err);
  const problem = f ? classifyProError(f.status, f.body.error) : 'UNAVAILABLE';
  if (problem === 'PRO_OFF')
    useMrOneHookProStore.setState({ availability: 'off', status: null, sheetOpen: false });
  return { ok: false, problem };
}

function applyStatus(out: object): void {
  useMrOneHookProStore.setState({
    status: withoutMetadata(out) as MrOneHookProStatus,
    availability: 'ready',
  });
}

let inflight: Promise<void> | null = null;

/** Reads the plan for `userId` (once per member unless `force`). */
export async function loadMrOneHookPro(userId: string, force = false): Promise<void> {
  const state = useMrOneHookProStore.getState();
  if (state.userId !== userId) {
    useMrOneHookProStore.setState({
      userId,
      status: null,
      availability: 'unknown',
      sheetOpen: false,
    });
  } else if (!force && (state.availability === 'ready' || state.availability === 'off')) {
    return;
  }
  if (inflight) return inflight;
  if (useMrOneHookProStore.getState().availability !== 'ready')
    useMrOneHookProStore.setState({ availability: 'loading' });
  inflight = (async () => {
    try {
      const out = await mrOneHookClient.getMrOneHookPro({});
      if (useMrOneHookProStore.getState().userId === userId) applyStatus(out);
    } catch (err) {
      const f = sdkFailure(err);
      const problem = f ? classifyProError(f.status, f.body.error) : 'UNAVAILABLE';
      if (useMrOneHookProStore.getState().userId !== userId) return;
      if (problem === 'PRO_OFF')
        useMrOneHookProStore.setState({ availability: 'off', status: null });
      else if (useMrOneHookProStore.getState().availability !== 'ready')
        useMrOneHookProStore.setState({ availability: 'error' });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** A chat turn reported the member's plan: re-read the status when it disagrees (bought, ended, ...). */
export function notePlanFromChat(plan: MrOneHookPlan | undefined): void {
  if (!plan) return;
  const { status, userId, availability } = useMrOneHookProStore.getState();
  if (userId && availability === 'ready' && status && status.plan !== plan)
    void loadMrOneHookPro(userId, true);
}

export function openMrOneHookPro(): void {
  const { userId, availability } = useMrOneHookProStore.getState();
  if (availability === 'off') return;
  useMrOneHookProStore.setState({ sheetOpen: true });
  if (userId) void loadMrOneHookPro(userId, true);
}

export function closeMrOneHookPro(): void {
  useMrOneHookProStore.setState({ sheetOpen: false });
}

/** Signs the change into the session (as the membership upgrade flow does) and re-reads State. */
async function refreshSessionAfterPurchase(): Promise<void> {
  try {
    await getCognitoAuth().refreshAccessToken();
  } catch {
    /* the plan is read from the server on every request; a stale token only delays the badge */
  }
  await refreshUserStateInStore();
}

export async function purchaseMrOneHookPro(
  billingPeriod: ProBillingPeriod
): Promise<ProActionResult> {
  try {
    const out = await mrOneHookClient.purchaseMrOneHookPro({
      idempotencyKey: crypto.randomUUID(),
      billingPeriod,
    });
    applyStatus(out);
    await refreshSessionAfterPurchase();
    return { ok: true };
  } catch (err) {
    const result = failure(err);
    // Included / already active / in progress: the screen should show the server's current view.
    const { userId } = useMrOneHookProStore.getState();
    if (userId && result.ok === false && result.problem !== 'PRO_OFF')
      void loadMrOneHookPro(userId, true);
    return result;
  }
}

export async function setMrOneHookProAutoRenew(autoRenew: boolean): Promise<ProActionResult> {
  try {
    applyStatus(await mrOneHookClient.updateMrOneHookProAutoRenew({ autoRenew }));
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

/** "Keep Mr OneHook Pro" after a membership that includes it ends. Nothing is charged now. */
export async function keepMrOneHookProAfterMembership(
  billingPeriod: ProBillingPeriod
): Promise<ProActionResult> {
  try {
    applyStatus(
      await mrOneHookClient.continueMrOneHookProAfterMembership({
        idempotencyKey: crypto.randomUUID(),
        billingPeriod,
      })
    );
    return { ok: true };
  } catch (err) {
    const result = failure(err);
    const { userId } = useMrOneHookProStore.getState();
    if (userId && result.ok === false && result.problem !== 'PRO_OFF')
      void loadMrOneHookPro(userId, true);
    return result;
  }
}

/** Withdraws a kept plan before it starts. */
export async function withdrawMrOneHookProContinuation(): Promise<ProActionResult> {
  try {
    await mrOneHookClient.cancelMrOneHookProContinuation({});
    const { userId } = useMrOneHookProStore.getState();
    if (userId) await loadMrOneHookPro(userId, true);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function dismissMrOneHookProNotice(noticeId: string): Promise<ProActionResult> {
  const { status } = useMrOneHookProStore.getState();
  if (status) {
    useMrOneHookProStore.setState({
      status: { ...status, notices: status.notices.filter((n) => n.noticeId !== noticeId) },
    });
  }
  try {
    await mrOneHookClient.dismissMrOneHookProNotice({ noticeId });
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

/** How often, and for how long, State is re-read while an upgrade waits for the Pro handover. */
export const ACTIVATION_POLL_MS = 3000;
export const ACTIVATION_POLL_LIMIT = 20;

/**
 * While State reports `pendingSubscriptionTier` (an upgrade to a tier that includes Pro, waiting for
 * the Mr OneHook Pro handover), re-reads State briefly; once the upgrade lands, the Pro status is read
 * again so the plan shows "Included with your membership".
 */
export function useActivatingMembershipPoll(pending: boolean, userId: string | undefined): void {
  useEffect(() => {
    if (!pending || !userId) return;
    let polls = 0;
    const id = window.setInterval(() => {
      polls += 1;
      void refreshUserStateInStore();
      if (polls >= ACTIVATION_POLL_LIMIT) window.clearInterval(id);
    }, ACTIVATION_POLL_MS);
    return () => {
      window.clearInterval(id);
      // The pending flag cleared (or the screen closed): read the plan again.
      void loadMrOneHookPro(userId, true);
    };
  }, [pending, userId]);
}
