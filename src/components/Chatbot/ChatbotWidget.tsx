import React, { useState, useRef, useEffect } from 'react';
import { Mascot } from './Mascot';
import { chatbotUrl } from '../../utils/env.config';
import { Maximize2, Minimize2, X } from 'lucide-react';
import './ChatbotWidget.css'; // Add a little standard CSS or use tailwind

type Mood = 'Happy' | 'Neutral' | 'Thinking' | 'Sad' | 'Excited';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const ChatbotWidget: React.FC = () => {
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
  }, [isOpen]);

  useEffect(() => {
    const handleScroll = () => {
      if (isOpen) return;
      const x = window.innerWidth - 60; 
      const y = window.innerHeight - 60; 
      const elements = document.elementsFromPoint(x, y);
      const isDark = elements.some(el => 
        el.classList && (el.classList.contains('bg-accent') || el.classList.contains('bg-black'))
      );
      setIsOverDark(isDark);

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
    // Run once on mount after a small delay
    setTimeout(handleScroll, 100);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isOpen]);

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
      // Point this to the deployed backend URL in production
      const response = await fetch(`${chatbotUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          userDemographics: { gender, sexualPreference }
        })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
        setMood(data.mood as Mood);
        setHasError(false);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: "Oops! I encountered an error. It might be rate limiting." }]);
        setMood('Sad');
        setHasError(true);
      }
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: "Oops! I couldn't reach the server." }]);
      setMood('Sad');
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`chatbot-widget-container ${isOpen ? 'open' : 'closed'} ${isHovered ? 'hovered' : ''} ${isFullScreen ? 'fullscreen' : ''} transition-all duration-500 opacity-100 translate-y-0`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!isOpen && (
        <div className="chatbot-trigger" onClick={() => setIsOpen(true)}>
          <div className="interactive-text bg-white text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg absolute -top-4 left-1/2 whitespace-nowrap animate-float-thought pointer-events-none z-10">
            {isInPageMascotVisible ? "He painted the wall" : "Talk to our mascot!"}
          </div>
          <div className={`transition-all duration-300 ${isOverDark ? 'drop-shadow-[0_15px_15px_rgba(255,255,255,0.4)]' : 'drop-shadow-2xl'}`}>
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
                  <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-pink-600 ${hasError ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                </div>
                <span className="font-bold">Mr. OneHook</span>
                <a href="https://onehook.club/app" target="_blank" rel="noreferrer" className="ml-2 px-2 py-1 bg-white text-pink-600 text-[10px] font-bold rounded-md hover:bg-pink-50 transition-colors uppercase tracking-wider">
                  Download App
                </a>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsFullScreen(!isFullScreen)} 
                  className="text-white hover:text-gray-200 transition-colors"
                  title={isFullScreen ? "Minimize" : "Full screen"}
                >
                  {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)} 
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
                  <p className="text-sm font-semibold">Tell me a bit about yourself so I can serve you better!</p>
                  <label className="text-sm">Gender</label>
                  <select className="border p-2 rounded" value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="man">Man</option>
                    <option value="woman">Woman</option>
                    <option value="nonbinary">Non-binary</option>
                  </select>
                  <label className="text-sm">Sexual Preference (Optional)</label>
                  <input type="text" className="border p-2 rounded" value={sexualPreference} onChange={e => setSexualPreference(e.target.value)} placeholder="e.g. straight, bisexual..." />
                  <button onClick={() => setSetupComplete(true)} className="bg-pink-600 text-white p-2 rounded mt-2 hover:bg-pink-700">Start Chat</button>
                </div>
              ) : (
                <>
                  {messages.length === 0 && (
                    <div className="text-center text-gray-400 text-sm mt-4">Feel free to share how you're feeling, ask about the OneHook platform, or just chat in general!</div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`p-2 rounded-xl max-w-[85%] text-sm ${m.role === 'user' ? 'bg-pink-100 text-pink-900 self-end' : 'bg-gray-100 text-gray-800 self-start'}`}>
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
                  className="flex-1 border rounded-full px-3 py-1 text-sm outline-none focus:border-pink-400"
                  placeholder="Ask a question..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} className="bg-pink-600 text-white rounded-full px-3 text-sm font-bold hover:bg-pink-700">Send</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
