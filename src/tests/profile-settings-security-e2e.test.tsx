// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BlockReason } from 'onehook-api-client';
import { ToastProvider } from '../components/common/Toast';
import { Login } from '../components/auth/Login';
import { AccountSettingsCard } from '../components/profile/AccountSettingsCard';
import { LivenessVerification } from '../components/profile/LivenessVerification';
import { MembershipCompareModal } from '../features/profile/MembershipCompareModal';
import { ProfileView } from '../features/profile/ProfileView';
import { SafetyBlockedDialog } from '../features/profile/SafetyBlockedDialog';
import { IdentityApi } from '../api/identity';
import { LivenessApi } from '../api/liveness';
import { ProfileApi } from '../api/profile';
import { StateApi } from '../api/state';
import * as cognitoMod from '../lib/cognito-auth';
import { loadMrOneHookPrefs } from '../lib/mr-onehook-prefs';
import { useAppStore } from '../store/app-store';
import { useArchiveStore, useWalletStore } from '../store/archive-store';
import {
  MatchingMode,
  MatchingProfileStatus,
  SubscriptionTier,
  UserState,
  type UserProfile,
  type UserStateSnapshot,
} from '../types';

vi.mock('../components/profile/FaceLivenessInner', () => ({
  default: ({ onAnalysisComplete }: { onAnalysisComplete: () => Promise<void> | void }) => (
    <button type="button" onClick={() => void onAnalysisComplete()}>
      Complete Mock Scan
    </button>
  ),
}));

beforeAll(() => {
  if (typeof window !== 'undefined' && typeof window.localStorage?.setItem !== 'function') {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      get length() {
        return mem.size;
      },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  }
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (typeof globalThis.CSS === 'undefined') {
    (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
      escape: (s: string) => s,
    };
  } else if (typeof globalThis.CSS.escape !== 'function') {
    globalThis.CSS.escape = (s: string) => s;
  }
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '');
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute('open');
      };
    }
  }
});

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>
  );
}

function makeState(over: Partial<UserStateSnapshot> = {}): UserStateSnapshot {
  return {
    userId: 'u1',
    state: UserState.AVAILABLE,
    activeConnections: 0,
    subscriptionTier: SubscriptionTier.MUST,
    effectiveCapacity: 1,
    selectionRequired: false,
    discoveryPaused: false,
    matching: { status: MatchingMode.ON, generation: 1 },
    matchingTabHidden: false,
    hooks: [],
    ...over,
  };
}

function makeUser(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    userId: 'u1',
    name: 'Asha',
    displayName: 'Asha',
    photos: [],
    age: 29,
    birthDetails: { date: '1996-05-10' },
    birthDateOnFile: true,
    matchingStatus: MatchingProfileStatus.ACTIVE,
    ...over,
  };
}

describe('Profile Hub, Settings & Security end-to-end flows', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({ userState: makeState(), currentUser: makeUser() });
    useArchiveStore.setState({ list: null, loading: false });
    useWalletStore.setState({ wallet: null, loading: false, boosting: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('switches Profile hub tabs, persists Mr.OneHook prefs, and refreshes membership tier comparison', async () => {
    vi.spyOn(StateApi, 'getWallet').mockResolvedValue({
      boosts: 0,
      roses: 0,
      archives: 0,
      roseDailyLimit: 0,
      products: [],
    });
    const refreshStateSpy = vi.spyOn(StateApi, 'getUserState').mockResolvedValue(makeState());
    vi.spyOn(cognitoMod, 'getCognitoAuth').mockReturnValue({
      refreshAccessToken: vi.fn().mockResolvedValue(undefined),
    } as never);

    render(wrap(<ProfileView user={makeUser()} onOpenMrOneHookChat={() => {}} />));

    const profileTab = screen.getByRole('tab', { name: 'Profile' });
    const generalTab = screen.getByRole('tab', { name: 'General' });
    const aiTab = screen.getByRole('tab', { name: 'Mr.OneHook' });
    expect(profileTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(generalTab);
    expect(generalTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/How OneHook works/i)).toBeTruthy();

    fireEvent.click(aiTab);
    expect(aiTab.getAttribute('aria-selected')).toBe('true');
    const toggle = screen.getByRole('checkbox', { name: /in message menus/i }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(loadMrOneHookPrefs('u1').asksInMessageMenus).toBe(false);

    cleanup();
    render(wrap(<MembershipCompareModal open onClose={() => {}} />));
    fireEvent.click(screen.getByRole('tab', { name: /Monthly/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Refresh my membership/i }));
    });
    expect(refreshStateSpy).toHaveBeenCalled();
  });

  it('loads blocked accounts and removes an account after explicit confirmation', async () => {
    vi.spyOn(StateApi, 'listBlocks').mockResolvedValue([
      {
        blockedUserId: 'bad1',
        displayName: 'Blocked Person',
        reason: BlockReason.SPAM,
        createdAt: 1_700_000_000,
      },
    ]);
    vi.spyOn(ProfileApi, 'getChat').mockResolvedValue({ displayName: 'Blocked Person' } as never);
    const unblockSpy = vi.spyOn(StateApi, 'unblockUser').mockResolvedValue(undefined);

    render(wrap(<SafetyBlockedDialog open onClose={() => {}} />));
    await waitFor(() => expect(screen.getByText('Blocked Person')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^Unblock$/i }));
    const confirmBtns = screen.getAllByRole('button', { name: /^Unblock$/i });
    await act(async () => {
      fireEvent.click(confirmBtns[confirmBtns.length - 1]);
    });
    expect(unblockSpy).toHaveBeenCalledWith('bad1');
    await waitFor(() => expect(screen.getByText(/No blocked accounts/i)).toBeTruthy());
  });

  it('completes phone update via OTP form and unlinks linked social provider with confirmation', async () => {
    vi.spyOn(cognitoMod, 'getCognitoAuth').mockReturnValue({
      getCurrentUser: vi.fn().mockResolvedValue({ username: 'u1', email: 'a@b.com', sub: 'u1' }),
    } as never);
    vi.spyOn(IdentityApi, 'getUser').mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      phoneNumber: '+14155550101',
      googleId: 'g-sub-1',
      googleEmail: 'asha@gmail.com',
    } as never);
    const reqOtpSpy = vi.spyOn(IdentityApi, 'requestPhoneUpdateOtp').mockResolvedValue({} as never);
    const updatePhoneSpy = vi.spyOn(IdentityApi, 'updatePhoneNumber').mockResolvedValue({} as never);
    const unlinkSpy = vi.spyOn(IdentityApi, 'unlinkSocial').mockResolvedValue({} as never);

    render(wrap(<AccountSettingsCard />));
    await waitFor(() => expect(screen.getByText(/\+14155550101/)).toBeTruthy());

    // Unlink Google flow
    fireEvent.click(screen.getByRole('button', { name: /Unlink Google/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }));
    });
    expect(unlinkSpy).toHaveBeenCalledWith('GOOGLE');

    // Update phone flow
    fireEvent.click(screen.getByRole('button', { name: /^Change$/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));
    });
    expect(reqOtpSpy).toHaveBeenCalledWith('+14155550101');

    const otpInput = await screen.findByLabelText(/Verification code/i);
    fireEvent.change(otpInput, { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));
    });
    expect(updatePhoneSpy).toHaveBeenCalledWith('+14155550101', '123456');
  });

  it('completes liveness session evaluation and supports WebAuthn passkey sign-in', async () => {
    const createSpy = vi.spyOn(LivenessApi, 'createSession').mockResolvedValue({ sessionId: 'sess-123' });
    const completeSpy = vi
      .spyOn(LivenessApi, 'completeSession')
      .mockResolvedValue({ status: 'APPROVED' } as never);
    vi.spyOn(LivenessApi, 'getStatus').mockResolvedValue({ status: 'NONE' });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: () => {} }] }),
      },
    });
    const onVerified = vi.fn();

    render(wrap(<LivenessVerification verified={false} onVerified={onVerified} />));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Verify with a selfie/i }));
    });
    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const completeBtn = await screen.findByRole('button', { name: 'Complete Mock Scan' });
    await act(async () => {
      fireEvent.click(completeBtn);
    });
    expect(completeSpy).toHaveBeenCalledWith('sess-123');
    expect(onVerified).toHaveBeenCalledTimes(1);

    cleanup();
    const passkeySpy = vi.fn().mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    vi.spyOn(cognitoMod, 'getCognitoAuth').mockReturnValue({
      loginWithPasskey: passkeySpy,
    } as never);

    render(wrap(<Login />));
    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(emailInput.getAttribute('autocomplete')).toBe('username webauthn');

    fireEvent.change(emailInput, { target: { value: 'asha@onehook.club' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Use a Passkey/i }));
    });
    expect(passkeySpy).toHaveBeenCalledWith('asha@onehook.club');
  });
});
