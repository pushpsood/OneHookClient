import React from 'react';
import { KeyRound } from 'lucide-react';
import { getCognitoAuth } from '../../lib/cognito-auth';
import { useToast } from '../common/Toast';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/app-store';

/**
 * Lets a signed-in member know how to set an account password.
 * Due to AWS Amplify v6 restrictions, a passwordless user cannot use
 * `updatePassword` (requires an old password) nor `resetPassword` 
 * (blocked if a session exists). The user must be signed out to set it.
 */
export function SetPasswordCard() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSignOutToSetPassword = async () => {
    try {
      await getCognitoAuth().logout();
      useAppStore.getState().setAuthenticated(false);
      showToast('Signed out. Please enter your email/phone and choose "Forgot Password" to set a password.', 'info');
      // Redirect to login page immediately after clearing state
      navigate('/');
    } catch (err: any) {
      showToast('Failed to sign out. Try refreshing the page.', 'error');
    }
  };

  return (
    <div className="border border-border p-8 space-y-5 bg-white">
      <div className="flex items-center gap-3">
        <KeyRound className="w-4 h-4 text-accent" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
            Account Password
          </div>
          <p className="mt-1 text-xs opacity-50 leading-relaxed">
            Set a password to sign in without a one-time code.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs opacity-70 leading-relaxed bg-bg/50 p-4 border border-border">
          Because your account is passwordless, AWS security requires you to be signed out to set a password for the first time. 
          <br /><br />
          Click below to securely sign out, then use the <strong>Forgot Password</strong> option on the login screen to set your new password.
        </p>
        <button
          onClick={handleSignOutToSetPassword}
          className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity"
        >
          Sign Out & Set Password
        </button>
      </div>
    </div>
  );
}
