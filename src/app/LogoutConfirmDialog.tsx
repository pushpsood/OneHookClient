import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldCheck, Zap, LockKeyhole, LogOut } from 'lucide-react';
import { UiElement, trackProps } from '../lib/analytics/analytics';

interface LogoutConfirmDialogProps {
  open: boolean;
  /** Dismiss and keep the session (the encouraged choice). */
  onStay: () => void;
  /** Proceed with the actual sign-out. */
  onConfirm: () => void;
}

/**
 * Confirmation shown before signing out. It intentionally frames staying signed in as the better
 * default on a personal device: the persisted session lets the member jump straight back into their
 * one conversation without re-entering an invite/OTP, and the device-held encryption keys stay put.
 * Signing out is still one tap away for shared or public devices.
 *
 * The backdrop dims and blurs the app so the member's attention is on the choice. "Keep me signed in"
 * is the primary action; Escape or a backdrop click also keeps the session.
 */
export function LogoutConfirmDialog({ open, onStay, onConfirm }: LogoutConfirmDialogProps) {
  const stayButtonRef = useRef<HTMLButtonElement>(null);

  // Escape keeps the member signed in (the safe, non-destructive default).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onStay]);

  // Move focus to the encouraged action when the dialog opens.
  useEffect(() => {
    if (open) stayButtonRef.current?.focus();
  }, [open]);

  const reasons = [
    {
      icon: Zap,
      title: 'Pick up right where you left off',
      text: 'Your session stays active, so you jump straight back to your one conversation — no invite code or OTP to re-enter.',
    },
    {
      icon: LockKeyhole,
      title: 'Your encrypted keys stay on this device',
      text: 'Messages are end-to-end encrypted. Staying signed in keeps the keys here, so your history is ready without a recovery step.',
    },
    {
      icon: ShieldCheck,
      title: 'Best when the device is yours',
      text: 'On a personal phone or laptop, staying signed in is the smoother, safer choice.',
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Dim + blur the whole app so focus lands on the prompt.
          className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          data-track-exempt="backdrop: click-away that keeps the member signed in; the explicit control (settings.sign_out dismiss) is tracked."
          onMouseDown={(e) => {
            // A click on the backdrop (not the card) keeps the member signed in.
            if (e.target === e.currentTarget) onStay();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-desc"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-2xl bg-surface-card text-text border border-border shadow-2xl p-6 sm:p-7"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full border-2 border-accent flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-text" />
              </div>
              <h2 id="logout-dialog-title" className="mt-4 text-xl font-semibold">
                Stay signed in?
              </h2>
              <p id="logout-dialog-desc" className="mt-2 text-sm text-text-secondary leading-relaxed">
                You don&rsquo;t have to log out. If this device is yours, keeping your session means
                less hassle and a smoother return.
              </p>
            </div>

            <ul className="mt-6 space-y-3.5">
              {reasons.map((r) => (
                <li key={r.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text">
                    <r.icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">{r.title}</p>
                    <p className="text-xs text-text-secondary leading-relaxed">{r.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-col gap-2.5">
              <button
                ref={stayButtonRef}
                type="button"
                onClick={onStay}
                {...trackProps(UiElement.SETTINGS_SIGN_OUT, { action: 'dismiss' })}
                className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
              >
                Keep me signed in
              </button>
              <button
                type="button"
                onClick={onConfirm}
                {...trackProps(UiElement.SETTINGS_SIGN_OUT)}
                className="w-full py-3 inline-flex items-center justify-center gap-2 border border-border text-red-500 text-sm font-semibold rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>

            <p className="mt-4 text-center text-[11px] text-text-muted">
              Logging out is best on a shared or public device.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
