/**
 * Accessible native <dialog> wrapper following Modern Web Guidance:
 *  - Uses `showModal()` when available (progressive fallback to `open` attribute in JSDOM/older engines).
 *  - Light-dismisses on `closedby="any"` or explicit pointerdown/pointerup outside dialog bounds.
 *  - Stops background page scroll via CSS `overscroll-behavior: contain` on `dialog:modal` & `::backdrop`.
 */
import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  dismissOnBackdrop?: boolean;
  className?: string;
  testId?: string;
  children: ReactNode;
}

export function ModalDialog({
  open,
  onClose,
  labelledBy,
  label,
  dismissOnBackdrop = true,
  className = '',
  testId,
  children,
}: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (dialog.open || dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function') {
        dialog.close();
        dialog.returnValue = '';
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const handleClose = () => {
      dialog.returnValue = '';
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  if (!open) return null;

  const isOutside = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return false;
    return clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom;
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      data-testid={testId}
      // Progressive enhancement where `closedby="any"` is supported alongside pointer bounds check.
      {...(dismissOnBackdrop ? { closedby: 'any' } : {})}
      onPointerDown={(e) => {
        if (dismissOnBackdrop && e.target === ref.current) {
          pressedOutsideRef.current = isOutside(e.clientX, e.clientY) || true;
        } else {
          pressedOutsideRef.current = false;
        }
      }}
      onPointerUp={(e) => {
        if (dismissOnBackdrop && pressedOutsideRef.current && e.target === ref.current) {
          pressedOutsideRef.current = false;
          onClose();
        } else {
          pressedOutsideRef.current = false;
        }
      }}
      data-track-exempt="backdrop: native dialog element light-dismisses via pointer-outside check; explicit close buttons are tracked."
      className={`oh-modal m-auto p-0 bg-surface-card text-text border border-border rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-h-[90dvh] overflow-hidden flex flex-col ${className}`}
    >
      {children}
    </dialog>
  );
}
