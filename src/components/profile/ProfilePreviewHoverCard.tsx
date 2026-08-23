import { motion, AnimatePresence } from 'motion/react';
import { Eye, Sparkles } from 'lucide-react';
import { DiscoveryCard, type DiscoveryProfileData } from '../../features/discovery/DiscoveryCard';

interface ProfilePreviewHoverCardProps {
  isVisible: boolean;
  profileData: DiscoveryProfileData;
  onClickFullPreview?: () => void;
}

export function ProfilePreviewHoverCard({
  isVisible,
  profileData,
  onClickFullPreview,
}: ProfilePreviewHoverCardProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute left-0 top-full mt-3 z-40 w-[360px] sm:w-[400px] pointer-events-auto"
        >
          <div className="bg-white border-2 border-accent shadow-2xl overflow-hidden">
            {/* Header / Click to expand cue */}
            <div
              onClick={onClickFullPreview}
              className="bg-accent text-white px-4 py-2.5 flex items-center justify-between text-[9px] uppercase font-black tracking-widest cursor-pointer hover:bg-accent/90 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-green-400" /> Live Feed Preview
              </span>
              <span className="flex items-center gap-1 text-white/80 font-mono">
                Click to expand <Sparkles className="w-3 h-3 text-amber-300" />
              </span>
            </div>

            {/* Compact DiscoveryCard Container */}
            <div className="max-h-[460px] overflow-y-auto">
              <DiscoveryCard candidate={profileData} isPreview={false} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
