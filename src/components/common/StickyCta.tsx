import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Smartphone } from 'lucide-react';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

/**
 * The floating conversion bar ("One connection. Zero distractions." · Get the app · Redeem invite),
 * shared by the landing and the science pages.
 *
 * It appears only while scrolling DOWN past the first screen, hides when scrolling up, and never
 * sits over the footer or an open Mr OneHook chat. The Redeem button drops out when the
 * "Get the app" label would wrap, measured on an invisible copy that always renders both buttons,
 * so the decision never oscillates.
 */
export function StickyCta({ onGetApp, onRedeem }: { onGetApp: () => void; onRedeem: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY + 2; // small threshold to ignore jitter
      const goingUp = y < lastY - 2;
      lastY = y;

      const pastFirstScreen = y > window.innerHeight * 0.7;
      const footer = document.querySelector('footer');
      const footerVisible = footer ? footer.getBoundingClientRect().top < window.innerHeight : false;
      const chatbotOpen = !!document.querySelector('.chatbot-window');

      if (chatbotOpen || footerVisible || !pastFirstScreen) setShow(false);
      else if (goingDown) setShow(true);
      else if (goingUp) setShow(false);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('chatbotToggle', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('chatbotToggle', onScroll);
    };
  }, []);

  const [hideRedeem, setHideRedeem] = useState(false);
  const appTextRef = useRef<HTMLSpanElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) return;
    const measure = () => {
      const el = appTextRef.current;
      if (el) setHideRedeem(el.getClientRects().length > 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (mirrorRef.current) ro.observe(mirrorRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3 }}
          id="sticky-cta"
          className="fixed bottom-4 inset-x-0 mx-auto z-[70] w-[calc(100%-2rem)] sm:w-max sm:max-w-[calc(100%-2rem)]"
        >
          {/* Invisible mirror (always both buttons) — measures whether the "Get the app" label wraps. */}
          <div
            ref={mirrorRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute inset-0 flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-full border border-white/10"
          >
            <span className="hidden md:block portrait:hidden whitespace-nowrap pl-4 pr-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
              One connection. Zero distractions.
            </span>
            <span className="flex-1 sm:flex-none block text-center px-4 py-2.5 sm:px-6 sm:py-3.5 border border-white/30 text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-[0.2em] rounded-full">
              <Smartphone className="inline w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 align-middle" />
              <span ref={appTextRef} className="align-middle">
                Get the app
              </span>
            </span>
            <span className="flex-1 sm:flex-none px-4 py-2.5 sm:px-6 sm:py-3.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-[0.2em] rounded-full inline-flex items-center justify-center gap-1.5 sm:gap-2">
              <span className="hidden sm:inline">Redeem invite</span>
              <span className="sm:hidden">Redeem</span>
              <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 bg-accent text-white p-2 sm:p-3 rounded-full shadow-2xl border border-white/10">
            <span className="hidden md:block portrait:hidden whitespace-nowrap pl-4 pr-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
              One connection. Zero distractions.
            </span>
            <button
              onClick={onGetApp}
              {...trackProps(UiElement.LANDING_SECTION_NAV, { value: 'get_app' })}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-4 py-2.5 sm:px-6 sm:py-3.5 border border-white/30 text-white text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-[0.2em] rounded-full hover:bg-white/10 transition-colors"
            >
              <Smartphone className="w-3 h-3 sm:w-4 sm:h-4" /> Get the app
            </button>
            {!hideRedeem && (
              <button
                onClick={onRedeem}
                {...trackProps(UiElement.LANDING_GET_STARTED)}
                className="flex-1 sm:flex-none px-4 py-2.5 sm:px-6 sm:py-3.5 bg-white text-accent text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-[0.2em] rounded-full hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 sm:gap-2"
              >
                <span className="hidden sm:inline">Redeem invite</span>
                <span className="sm:hidden">Redeem</span>
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
