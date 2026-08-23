import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Eye } from 'lucide-react';
import { DiscoveryCard, type DiscoveryProfileData } from '../../features/discovery/DiscoveryCard';

interface ProfilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileData: DiscoveryProfileData;
}

export function ProfilePreviewModal({
  isOpen,
  onClose,
  profileData,
}: ProfilePreviewModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            aria-hidden="true"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.05 }}
            className="relative w-full max-w-[460px] max-h-[92vh] z-10 flex flex-col bg-white border border-border shadow-2xl overflow-hidden"
          >
            {/* Sleek integrated header */}
            <div className="bg-accent text-white px-5 py-3 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-green-400" />
                <span className="text-[10px] uppercase font-black tracking-[0.25em]">
                  Discovery Feed Preview
                </span>
                <span className="text-[8px] font-mono px-1.5 py-0.5 bg-white/20 rounded text-white tracking-normal">
                  Live
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Discovery Card */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <DiscoveryCard
                candidate={profileData}
                isPreview={true}
                className="border-none shadow-none max-w-full"
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
