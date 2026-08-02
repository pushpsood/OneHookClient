import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);

    timers.current[id] = globalThis.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      delete timers.current[id];
    }, 5000) as unknown as number;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current[id];
    if (timer) {
      globalThis.clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  useEffect(() => {
    return () => {
      Object.keys(timers.current).forEach((id) => {
        globalThis.clearTimeout(timers.current[id]);
      });
      timers.current = {};
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-8 right-8 space-y-4" style={{ zIndex: 100 }}>
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-border shadow-xl p-6 max-w-md flex items-start gap-4"
              style={{ minWidth: 300 }}
              role="status"
              aria-live="polite"
            >
              {toast.type === 'success' && (
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              )}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-accent shrink-0" />}

              <p className="text-sm flex-1">{toast.message}</p>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-border hover:text-accent transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
