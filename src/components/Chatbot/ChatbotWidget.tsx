import React, { useState, useRef, useEffect } from 'react';
import { Mascot } from './Mascot';
import { chatbotUrl } from '../../utils/env.config';
import { PUBLIC_PRODUCT_CHAT_PATH } from '../../lib/mr-onehook-contract';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import './ChatbotWidget.css'; // Add a little standard CSS or use tailwind

type Mood = 'Happy' | 'Neutral' | 'Thinking' | 'Sad' | 'Excited';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatbotWidgetProps {
  /** Extra page-level switch; the widget also hides itself over `data-mr-onehook-hide` zones. */
  isVisible?: boolean;
}

/**
 * Mark any section with this attribute (e.g. a page hero) and Mr OneHook stays hidden while it fills
 * the screen. Same rule the landing page always used: the mascot appears once the content after the
 * zone has scrolled into the bottom 10% of the viewport.
 */
export const MR_ONEHOOK_HIDE_ATTR = 'data-mr-onehook-hide';
/** Spread onto a section to hide Mr OneHook while it fills the screen: `<section {...hideMrOneHook}>`. */
export const hideMrOneHook = { [MR_ONEHOOK_HIDE_ATTR]: '' } as const;
const HIDE_UNTIL = 0.9;

function isInsideHideZone(): boolean {
  const vh = window.innerHeight;
  return [...document.querySelectorAll(`[${MR_ONEHOOK_HIDE_ATTR}]`)].some((zone) => {
    const r = zone.getBoundingClientRect();
    return r.top < vh && r.bottom > vh * HIDE_UNTIL;
  });
}

/** Relative luminance of a CSS colour string, or null when it is (nearly) transparent. */
function luminance(color: string): number | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (a < 0.5) return null;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** True when the first solid background under (x, y), excluding the widget itself, is dark. */
function isDarkBehind(x: number, y: number, self: Element | null): boolean {
  for (const el of document.elementsFromPoint(x, y)) {
    if (self && self.contains(el)) continue;
    const l = luminance(getComputedStyle(el).backgroundColor);
    if (l !== null) return l < 0.18;
  }
  return false;
}

export const ChatbotWidget: React.FC<ChatbotWidgetProps> = ({ isVisible = true }) => {
  const [outsideHideZone, setOutsideHideZone] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const [setupComplete, setSetupComplete] = useState(false);
  const [gender, setGender] = useState('man');
  const [sexualPreference, setSexualPreference] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mood, setMood] = useState<Mood>('Happy');
  const [loading, setLoading] = useState(false);
  // error is true if last response failed
  const [hasError, setHasError] = useState(false);
  const [isOverDark, setIsOverDark] = useState(false);
  const [isInPageMascotVisible, setIsInPageMascotVisible] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close on click outside if we are in full screen
      if (isFullScreen) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isFullScreen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chatbotToggle', { detail: isOpen }));
    if (!isOpen) {
      setIsFullScreen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isFullScreen) {
      const scrollY = window.scrollY;
      document.body.dataset.scrollY = scrollY.toString();
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overscrollBehaviorY = 'none';

      const handleViewportChange = () => {
        if (window.visualViewport && containerRef.current) {
          // Sync height to exact visual space above keyboard
          containerRef.current.style.height = `${window.visualViewport.height}px`;
          // If iOS Safari pans the layout up, offsetTop increases. We push top down to counteract it.
          containerRef.current.style.top = `${window.visualViewport.offsetTop}px`;
        }
      };

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportChange);
        window.visualViewport.addEventListener('scroll', handleViewportChange);
        // Small delay to ensure it applies after keyboard animation
        setTimeout(handleViewportChange, 100);
        handleViewportChange();
      }

      return () => {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleViewportChange);
          window.visualViewport.removeEventListener('scroll', handleViewportChange);
        }
        if (containerRef.current) {
          containerRef.current.style.height = '';
          containerRef.current.style.top = '';
        }
        const savedScrollY = document.body.dataset.scrollY;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.style.overscrollBehaviorY = '';
        if (savedScrollY) {
          window.scrollTo(0, parseInt(savedScrollY));
        }
      };
    } else {
      const scrollY = document.body.dataset.scrollY;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.overscrollBehaviorY = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY));
      }
    }
  }, [isFullScreen]);

  useEffect(() => {
    const handleScroll = () => {
      setOutsideHideZone(!isInsideHideZone());
      if (isOpen) return;
      setIsOverDark(isDarkBehind(window.innerWidth - 60, window.innerHeight - 60, containerRef.current));

      const inPageMascot = document.getElementById('mascot-container');
      if (inPageMascot) {
        const rect = inPageMascot.getBoundingClientRect();
        // Visible if top is above bottom of screen and bottom is below top of screen
        setIsInPageMascotVisible(rect.top < window.innerHeight && rect.bottom > 0);
      } else {
        setIsInPageMascotVisible(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();
    // Run again once the page has painted (fonts/images can shift layout)
    const t = window.setTimeout(handleScroll, 100);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  // Once open, never hide the conversation just because a hide zone scrolled back into view.
  const shown = isVisible && (outsideHideZone || isOpen);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setMood('Thinking');

    try {
      const response = await fetch(`${chatbotUrl}${PUBLIC_PRODUCT_CHAT_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          userDemographics: { gender, sexualPreference },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
        setMood(data.mood as Mood);
        setHasError(false);
      } else {
        setMessages([
          ...newMessages,
          {
            role: 'assistant',
            content: 'Sorry — I got a little overwhelmed there. Give me a moment and try again.',
          },
        ]);
        setMood('Sad');
        setHasError(true);
      }
    } catch (e) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content:
            "Hmm, I can't connect right now. Check your connection and try again in a moment.",
        },
      ]);
      setMood('Sad');
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`chatbot-widget-container ${isOpen ? 'open' : 'closed'} ${isHovered ? 'hovered' : ''} ${isFullScreen ? 'fullscreen' : ''} transition-all duration-500 ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
      aria-hidden={shown ? undefined : true}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!isOpen && (
        <div className="chatbot-trigger" onClick={() => setIsOpen(true)} {...trackProps(UiElement.LANDING_CHATBOT_WIDGET, { value: 'open' })}>
          <div className="interactive-text bg-white text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg absolute -top-4 left-1/2 whitespace-nowrap animate-float-thought pointer-events-none z-10">
            {isInPageMascotVisible ? 'Say hi to Mr.OneHook' : 'Talk to Mr.OneHook!'}
          </div>
          <div
            className={`transition-all duration-300 ${isOverDark ? 'drop-shadow-[0_15px_15px_rgba(255,255,255,0.4)]' : 'drop-shadow-2xl'}`}
          >
            <Mascot mood={mood} lookingUpLeft={isInPageMascotVisible} className="w-24 h-24" />
          </div>
        </div>
      )}

      {isOpen && (
        <div className="chatbot-window bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden flex flex-row w-full h-full">
          {/* Chat Side */}
          <div className={`flex flex-col ${isFullScreen ? 'w-full' : 'w-[350px]'}`}>
            <div className="bg-pink-600 text-white p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Mascot mood={mood} className="w-8 h-8" />
                  <div
                    className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-pink-600 ${hasError ? 'bg-orange-500' : 'bg-green-500'}`}
                  ></div>
                </div>
                <span className="font-bold">Mr. OneHook</span>
                <a
                  href="https://onehook.club/app"
                  target="_blank"
                  rel="noreferrer"
                  {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
                  className="ml-2 px-2 py-1 bg-white text-pink-600 text-[10px] font-bold rounded-md hover:bg-pink-50 transition-colors uppercase tracking-wider"
                >
                  Download App
                </a>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  {...trackProps(UiElement.LANDING_CHATBOT_WIDGET, { value: 'fullscreen' })}
                  className="text-white hover:text-gray-200 transition-colors"
                  title={isFullScreen ? 'Minimize' : 'Full screen'}
                >
                  {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  {...trackProps(UiElement.LANDING_CHATBOT_WIDGET, { value: 'close' })}
                  className="text-white hover:text-gray-200 transition-colors"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {!setupComplete ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold">
                    Tell me a little about yourself so I can keep things relevant.
                  </p>
                  <label className="text-sm">Gender</label>
                  <select
                    className="border p-2 rounded"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="man">Man</option>
                    <option value="woman">Woman</option>
                    <option value="nonbinary">Non-binary</option>
                  </select>
                  <label className="text-sm">Who you're into (optional)</label>
                  <input
                    type="text"
                    className="border p-2 rounded"
                    value={sexualPreference}
                    onChange={(e) => setSexualPreference(e.target.value)}
                    placeholder="e.g. women, men, everyone…"
                  />
                  <button
                    onClick={() => setSetupComplete(true)}
                    {...trackProps(UiElement.LANDING_CHATBOT_WIDGET, { value: 'start' })}
                    className="bg-pink-600 text-white p-2 rounded mt-2 hover:bg-pink-700"
                  >
                    Start chatting
                  </button>
                </div>
              ) : (
                <>
                  {messages.length === 0 && (
                    <div className="text-center text-gray-400 text-sm mt-4">
                      Share what's on your mind, ask me anything about OneHook, or just say hi.
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded-xl max-w-[85%] text-sm ${m.role === 'user' ? 'bg-pink-100 text-pink-900 self-end' : 'bg-gray-100 text-gray-800 self-start'}`}
                    >
                      {m.content}
                    </div>
                  ))}
                  {loading && <div className="text-xs text-gray-400">Typing...</div>}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {setupComplete && (
              <div className="p-3 border-t bg-gray-50 flex gap-2">
                <input
                  type="text"
                  className="flex-1 border rounded-full px-3 py-1 text-[16px] md:text-sm outline-none focus:border-pink-400"
                  placeholder="Say something…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  onFocus={() => {
                    setTimeout(() => {
                      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }, 300);
                  }}
                />
                <button
                  onClick={handleSend}
                  {...trackProps(UiElement.LANDING_CHATBOT_WIDGET, { value: 'send' })}
                  className="bg-pink-600 text-white rounded-full px-3 text-sm font-bold hover:bg-pink-700"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
