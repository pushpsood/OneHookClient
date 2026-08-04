import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'motion/react';
import {
  Heart,
  Focus,
  Lock,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Check,
  Shuffle,
  ShieldCheck,
  Smartphone,
  QrCode,
  X,
  MapPin,
  Sparkles,
  HeartHandshake,
  Scale,
  Gauge,
  Target,
  Radar,
  Zap,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { BrandWordmark } from './common/BrandWordmark';
import { AppleIcon, AndroidIcon } from './common/BrandIcons';
import { SiteFooter } from './common/SiteFooter';
import { AlienScanner } from './mascot';

const focusIntentionImage = '/media/aerial-view-of-the-city-in-the-fog-5ZBZNUT-1600.jpg';
const discoverProfilesImage =
  '/media/man-with-backpack-walking-on-snow-covered-forest-b-JAJ77DS-1600.jpg';

/**
 * Lays out a sequence of chips/separators horizontally, but automatically
 * switches to a centered vertical stack when the horizontal layout would wrap
 * onto more than two lines. Separators flagged with `rotateWhenStacked` (e.g.
 * arrows) are rotated 90° to point downward in the vertical layout.
 *
 * Wrapping is measured on an invisible horizontal "mirror" that always reflects
 * the horizontal layout at the current width, so the decision is two‑way
 * (re‑expands to a row when there's room again).
 */
type FlowPart = { key: string; content: React.ReactNode; rotateWhenStacked?: boolean };

function AdaptiveFlow({
  parts,
  className,
  rowClass,
  colClass,
  centerHorizontal = false,
  maxLines = 2,
  overflowBehavior = 'stack',
}: {
  parts: FlowPart[];
  className?: string;
  rowClass: string;
  colClass: string;
  /** Center the horizontal (non-stacked) layout too. */
  centerHorizontal?: boolean;
  /** How many wrapped lines are allowed before the overflow behavior kicks in. */
  maxLines?: number;
  /** What to do when the horizontal layout exceeds `maxLines`. */
  overflowBehavior?: 'stack' | 'hide';
}) {
  const [overflow, setOverflow] = useState(false);
  const mirrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mirrorRef.current;
    if (!el) return;
    const measure = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      const rows = new Set(kids.map((k) => Math.round(k.offsetTop)));
      setOverflow(rows.size > maxLines);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [parts, maxLines]);

  const renderParts = (isStacked: boolean) =>
    parts.map((p) => (
      <span
        key={p.key}
        className={`inline-flex items-center${isStacked && p.rotateWhenStacked ? ' rotate-90' : ''}`}
      >
        {p.content}
      </span>
    ));

  const stacked = overflow && overflowBehavior === 'stack';
  const hidden = overflow && overflowBehavior === 'hide';

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Invisible horizontal mirror used only to count wrapped rows. */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className={`${rowClass} invisible absolute -z-10 h-0 w-full overflow-hidden`}
      >
        {renderParts(false)}
      </div>

      {!hidden && (
        <div className={stacked ? colClass : `${rowClass}${centerHorizontal ? ' justify-center' : ''}`}>
          {renderParts(stacked)}
        </div>
      )}
    </div>
  );
}
const connectWithPurposeImage = '/media/man-playing-guitar-close-up-1600.jpg';
const getHookedImage =
  '/media/photodune-33277756-pleased-redhead-woman-student-watches-training-webinar-1600.jpg';
const heroVideoSource =
  '/media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc-1280.mp4';
const heroVideoPoster =
  '/media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc-poster.jpg';
const brandMarkImage = '/media/onehook-512.png';

/**
 * Placeholder deep link for the mobile app. Swap this for the real smart-link
 * (a single URL that routes to the App Store / Google Play by platform) once
 * the apps are published — the QR code and store badges both read from here.
 */
const APP_DOWNLOAD_URL = 'https://onehook.club/app';

/** Repeating text tile used as the conversation-starter background watermark.
 *  A tiled SVG guarantees full (corner-to-corner) coverage at any rotation. */
const WATERMARK_BG = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='40'><text x='0' y='15' font-family='Inter,ui-sans-serif,sans-serif' font-size='15' font-weight='900' letter-spacing='4' fill='#ffffff'>SUCCESS STORIES COMING SOON</text></svg>"
)}")`;

/**
 * Interactive "conversation starters" — the literal first message you'd send
 * your one match. This is the page's pattern-interrupt: it demonstrates the
 * product's whole point (intentional conversation) and invites the visitor to
 * imagine theirs.
 */
const OPENERS = [
  'What did you change your mind about this year?',
  'Chai ya coffee \u2014 and what does your order say about you?',
  'Sell me on your perfect Sunday.',
  'Batao \u2014 one thing you\u2019re low-key obsessed with right now?',
  'If we skipped the small talk \u2014 what should I actually ask you?',
  'Scene kya hai this weekend \u2014 plans ya total chill?',
  "What's a small thing that made you feel alive this week?",
  'Sabse underrated thing about your city?',
  'What are you paying attention to right now?',
  'Ek gaana that\u2019s always on your playlist \u2014 no skips?',
];

export function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stepsRailRef = useRef<HTMLDivElement>(null);

  // "Get the app" section: converge the text + phone toward each other as the
  // section reaches the viewport center, and let them spread back out as it
  // scrolls away (toward the top or bottom). Driven by a scroll listener so it
  // works reliably regardless of scroll-container quirks.
  const convoRef = useRef<HTMLElement>(null);
  const [watermarkSize, setWatermarkSize] = useState(0);

  const getAppRef = useRef<HTMLElement>(null);
  const appLeftX = useMotionValue(0);
  const appRightX = useMotionValue(0);
  // Spring-smooth the raw scroll values so the convergence glides instead of stepping.
  const appLeftXSpring = useSpring(appLeftX, { stiffness: 90, damping: 20, mass: 0.5 });
  const appRightXSpring = useSpring(appRightX, { stiffness: 90, damping: 20, mass: 0.5 });

  useEffect(() => {
    const el = getAppRef.current;
    if (!el) return;
    
    // Disable animation on mobile devices
    const isMobile = window.innerWidth < 768; // md breakpoint
    if (isMobile) {
      appLeftX.set(0);
      appRightX.set(0);
      return;
    }
    
    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || 1;
      const sectionCenter = rect.top + rect.height / 2;
      const distance = Math.abs(sectionCenter - viewportH / 2);
      const maxDistance = viewportH / 2 + rect.height / 2;
      const t = Math.min(distance / maxDistance, 1); // 0 = centered, 1 = far away
      // Natural layout is the default (at the edges); as the section centers,
      // the two columns drift closer together (up to just short of overlapping).
      const converge = 56 * (1 - t);
      appLeftX.set(converge); // text drifts toward center
      appRightX.set(-converge); // phone drifts toward center
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [appLeftX, appRightX]);

  // If navigated here with a hash (e.g. /#get-app from a legal page footer),
  // scroll to that section once it's laid out.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [location.hash]);

  // Size the conversation-starter watermark to the section's DIAGONAL so the
  // rotated, tiled text always covers the whole background (no empty corners),
  // recalculating on window resize / resolution changes.
  useEffect(() => {
    const el = convoRef.current;
    if (!el) return;
    const measure = () =>
      setWatermarkSize(Math.ceil(Math.hypot(el.offsetWidth, el.offsetHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const [activeStep, setActiveStep] = useState(0);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [openerIndex, setOpenerIndex] = useState(0);
  const [showStickyCta, setShowStickyCta] = useState(false);

  // Sticky CTA: hide the redeem button when the "Get the app" label wraps to
  // more than one line. Measured on an invisible mirror that always renders
  // BOTH buttons, so the decision doesn't oscillate once the redeem is removed.
  const [hideStickyRedeem, setHideStickyRedeem] = useState(false);
  const ctaAppTextRef = useRef<HTMLSpanElement>(null);
  const ctaMirrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showStickyCta) return;
    const measure = () => {
      const el = ctaAppTextRef.current;
      if (!el) return;
      setHideStickyRedeem(el.getClientRects().length > 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ctaMirrorRef.current) ro.observe(ctaMirrorRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [showStickyCta]);

  type RelationshipMode = 'single' | 'taken';
  const [relationshipMode, setRelationshipMode] = useState<RelationshipMode>('single');

  const allHowItWorksSteps = useMemo(
    () => [
      {
        id: '01',
        // Discovery is only relevant to singles.
        modes: ['single'] as RelationshipMode[],
        label: 'Discover with Intent',
        eyebrow: 'Curated Discovery',
        image: discoverProfilesImage,
        alt: 'Discover profiles',
        accent: 'bg-accent/10',
        summary:
          'A small, deliberate set of people who already align with your values. No infinite feed. No fatigue. Just a considered moment of attention.',
        bullets: ['Verified profiles only', 'Distance-aware matching', 'Shared values & interests'],
      },
      {
        id: '02',
        // Connecting applies whether you're single or already seeing someone.
        modes: ['single', 'taken'] as RelationshipMode[],
        label: 'Connect with Purpose',
        eyebrow: 'Real Conversation',
        image: connectWithPurposeImage,
        alt: 'Connect and match',
        accent: 'bg-accent/15',
        summary:
          'Send one message that matters and feel the weight of a real reply. Every tap is deliberate; every conversation is private by default.',
        bullets: ['End-to-end encrypted', 'Real-time delivery', 'No read-receipt games'],
      },
      {
        id: '03',
        // Single-threaded focus applies to both audiences.
        modes: ['single', 'taken'] as RelationshipMode[],
        label: 'Get Hooked, Intentionally',
        eyebrow: 'One at a Time',
        image: getHookedImage,
        alt: 'Get hooked',
        accent: 'bg-accent/20',
        summary:
          'When you both say yes, the noise disappears. Your discovery queue closes, and the only thing left is the person in front of you.',
        bullets: ['Single-threaded focus', 'One person, fully', 'Mutual commitment'],
      },
    ],
    []
  );

  // Each step declares which audiences it applies to. Singles get the full
  // flow; people already seeing someone use OneHook as a priority-notification
  // messenger, so they see only the steps tagged for the "taken" mode.
  const howItWorksSteps = useMemo(
    () => allHowItWorksSteps.filter((step) => step.modes.includes(relationshipMode)),
    [relationshipMode, allHowItWorksSteps]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Video autoplay was prevented; user interaction will trigger play
        });
      }
    }
  }, []);

  // Auto-rotate the conversation-starter openers.
  useEffect(() => {
    const id = window.setInterval(() => {
      setOpenerIndex((prev) => (prev + 1) % OPENERS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  // Show the persistent CTA only while scrolling DOWN (past the hero), and hide
  // it once the footer scrolls into view so it never sits over the footer.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY + 2; // small threshold to ignore jitter
      const goingUp = y < lastY - 2;
      lastY = y;

      const pastHero = y > window.innerHeight * 0.7;
      const footer = document.querySelector('footer');
      const footerVisible = footer
        ? footer.getBoundingClientRect().top < window.innerHeight
        : false;

      if (footerVisible || !pastHero) {
        setShowStickyCta(false);
      } else if (goingDown) {
        setShowStickyCta(true);
      } else if (goingUp) {
        setShowStickyCta(false);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const rail = stepsRailRef.current;
    if (!rail) return;

    let raf = 0;

    // Determine the active step by which card is closest to the rail's
    // horizontal center. This mirrors the visually-centered (snapped) card, so
    // the highlighted card and the progress timeline never drift apart. (A
    // viewport IntersectionObserver can't do this for a horizontal scroller —
    // every card intersects the viewport vertically at once.)
    const computeActive = () => {
      const cards = rail.querySelectorAll<HTMLElement>('[data-step-card]');
      if (!cards.length) return;

      const railRect = rail.getBoundingClientRect();
      const railCenter = railRect.left + railRect.width / 2;

      let bestIndex = 0;
      let bestDistance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const distance = Math.abs(cardCenter - railCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      setActiveStep((prev) => (prev !== bestIndex ? bestIndex : prev));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeActive);
    };

    computeActive();
    rail.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      rail.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const scrollToStep = (index: number) => {
    const rail = stepsRailRef.current;
    if (!rail || !howItWorksSteps[index]) return;
    const cards = rail.querySelectorAll('[data-step-card]');
    const card = cards.item(index) as HTMLElement | null;
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  const handleRelationshipModeChange = (mode: RelationshipMode) => {
    if (mode === relationshipMode) return;
    setRelationshipMode(mode);
    setActiveStep(0);
    // Reset the carousel to the first (visible) card for the new mode.
    stepsRailRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: 'smooth' });
    setIsMobileNavOpen(false);
  };

  const shuffleOpener = () =>
    setOpenerIndex((prev) => {
      let next = prev;
      while (next === prev) next = Math.floor(Math.random() * OPENERS.length);
      return next;
    });

  const goRedeemInvite = () => navigate('/redeem');

  return (
    <div className="min-h-screen bg-white text-text overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <BrandWordmark
            className="font-bold tracking-tighter uppercase"
            imageClassName="h-10 w-auto sm:h-10"
            textClassName="hidden sm:inline text-2xl"
          />
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="relative md:hidden">
              <button
                onClick={() => setIsMobileNavOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 px-3 py-2 border border-border text-[10px] font-black uppercase tracking-[0.2em]"
                aria-expanded={isMobileNavOpen}
                aria-label="Toggle navigation menu"
              >
                Explore
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${isMobileNavOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isMobileNavOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 border border-border bg-white shadow-lg">
                  <button
                    onClick={() => scrollToSection('philosophy')}
                    className="block w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] opacity-70 hover:opacity-100 transition-opacity"
                  >
                    Philosophy
                  </button>
                  <button
                    onClick={() => scrollToSection('features')}
                    className="block w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] opacity-70 hover:opacity-100 transition-opacity border-t border-border"
                  >
                    How it works
                  </button>
                  <button
                    onClick={() => scrollToSection('get-app')}
                    className="block w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] opacity-70 hover:opacity-100 transition-opacity border-t border-border"
                  >
                    Get the app
                  </button>
                </div>
              )}
            </div>

            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => scrollToSection('philosophy')}
                className="text-xs font-bold uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity"
              >
                Philosophy
              </button>
              <button
                onClick={() => scrollToSection('features')}
                className="text-xs font-bold uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity"
              >
                How it works
              </button>
              <button
                onClick={() => scrollToSection('get-app')}
                className="text-xs font-bold uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity"
              >
                Get the app
              </button>
              <button
                onClick={() => navigate('/login')}
                className="text-xs font-bold uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity"
              >
                Sign in
              </button>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="md:hidden px-3 sm:px-4 py-2 border border-border text-[10px] font-bold uppercase tracking-[0.22em] hover:bg-bg transition-colors"
            >
              Sign in
            </button>

            <button
              onClick={goRedeemInvite}
              className="px-4 sm:px-6 py-2 bg-accent text-white text-[10px] sm:text-xs font-bold uppercase tracking-[0.22em] sm:tracking-[0.3em] hover:opacity-90 transition-opacity"
            >
              <span className="sm:hidden">Sign up</span>
              <span className="hidden sm:inline">Redeem Invite</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 pt-20 relative bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={heroVideoPoster}
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover z-0"
        >
          <source src={heroVideoSource} type="video/mp4" />
        </video>

        {/* Legibility gradient — darker at edges, keeps center airy */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/70 via-black/40 to-black/80" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-4xl relative w-full z-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 border border-white/25 rounded-full backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-status-hooked animate-pulse" />
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.28em] text-white/85">
              Invite-only · Slow dating, done right
            </span>
          </div>

          <h1 className="text-6xl md:text-8xl font-serif italic tracking-tight mb-6 leading-[0.95] text-white drop-shadow-lg">
            One connection.
            <br />
            Zero distractions.
          </h1>

          <p className="relative text-lg md:text-2xl text-white/90 italic font-serif mb-10 leading-relaxed max-w-2xl mx-auto drop-shadow-md">
            {/* Invisible sizer reserves the final space so buttons below don't
                shift while the line types out. */}
            <span className="invisible" aria-hidden="true">
              The swipe era is over. Meet one person at a time — and actually talk.
            </span>
            <span className="absolute inset-0">
              <Typewriter text="The swipe era is over. Meet one person at a time — and actually talk." />
            </span>
          </p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button
              onClick={goRedeemInvite}
              className="px-8 py-4 bg-white text-accent text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity flex items-center gap-2 shadow-xl"
            >
              Redeem your invite <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>

          <p className="mt-5 text-[11px] sm:text-xs text-white/60 italic">
            Have an invite code? Redeem it in seconds. Don&rsquo;t have one yet? Ask a member.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-white/70">
            <span className="inline-flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" /> End-to-end encrypted
            </span>
            <span className="inline-flex items-center gap-2">
              <Focus className="w-3.5 h-3.5" /> One match at a time
            </span>
            <span className="inline-flex items-center gap-2">
              <Heart className="w-3.5 h-3.5" /> No ads. No algorithms selling you.
            </span>
          </div>

          <p className="mt-5 inline-flex items-center justify-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.28em] text-white/90">
            <span aria-hidden="true" className="text-xs sm:text-sm leading-none">🇮🇳</span>
            Made in India, for the world
          </p>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mt-14 opacity-50 text-white"
          >
            <ChevronDown className="w-6 h-6 mx-auto" />
          </motion.div>
        </motion.div>
      </section>

      {/* Conversation Starter — the pattern interrupt */}
      <section
        ref={convoRef}
        className="py-24 pb-32 px-6 bg-accent text-white relative overflow-hidden z-10"
        style={{
          // Convex "parabola" bottom edge instead of a flat line, with a soft
          // black shadow cast downward onto the section below for depth.
          borderBottomLeftRadius: '50% 72px',
          borderBottomRightRadius: '50% 72px',
          boxShadow: '0 28px 44px -12px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Repeating watermark — this placeholder section will be swapped for real success stories */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 overflow-hidden"
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 opacity-[0.025] blur-[1.5px]"
            style={{
              width: watermarkSize || '150%',
              height: watermarkSize || '150%',
              backgroundImage: WATERMARK_BG,
              backgroundRepeat: 'repeat',
              backgroundSize: '640px 40px',
            }}
          />
        </div>

        {/* Silver shimmer accent — a fixed-width band pinned to the top-left
            corner. Diagonal silver lines are strongest at the left edge and
            fade out towards the right (Zomato-Gold style, in silver). */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute top-0 left-0 h-64 w-[min(55%,460px)]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(60deg, rgba(226,230,236,0.55) 0px, rgba(226,230,236,0.55) 1.5px, rgba(255,255,255,0.06) 1.5px, rgba(255,255,255,0.06) 4px, transparent 4px, transparent 14px)',
            // Fade on BOTH axes (right + bottom) so no hard edges show. The two
            // gradients are intersected, so a pixel is only visible where both
            // the horizontal and vertical fades are still opaque.
            WebkitMaskImage:
              'linear-gradient(to right, #000 0%, rgba(0,0,0,0.3) 38%, transparent 80%), linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.3) 38%, transparent 80%)',
            WebkitMaskComposite: 'source-in',
            maskImage:
              'linear-gradient(to right, #000 0%, rgba(0,0,0,0.3) 38%, transparent 80%), linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.3) 38%, transparent 80%)',
            maskComposite: 'intersect',
          }}
        />

        <div className="max-w-4xl mx-auto text-center relative">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-[11px] uppercase tracking-[0.4em] text-white/50 mb-8"
          >
            Every hook starts with a sentence
          </motion.p>

          <div className="min-h-[160px] md:min-h-[180px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.blockquote
                key={openerIndex}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="text-3xl md:text-5xl font-serif italic leading-tight max-w-3xl"
              >
                &ldquo;{OPENERS[openerIndex]}&rdquo;
              </motion.blockquote>
            </AnimatePresence>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={shuffleOpener}
              className="inline-flex items-center gap-2 px-6 py-3 border border-white/30 text-[11px] font-black uppercase tracking-[0.24em] hover:bg-white hover:text-accent transition-colors rounded-full"
            >
              <Shuffle className="w-3.5 h-3.5" /> Shuffle the opener
            </button>
            <button
              onClick={goRedeemInvite}
              className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-white/80 hover:text-white transition-colors"
            >
              Start the conversation <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <p className="mt-8 text-xs text-white/50 italic max-w-md mx-auto">
            On OneHook you get one conversation at a time. Make the first line count.
          </p>
        </div>
      </section>

      {/* Philosophy Section */}
      <section id="philosophy" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-6"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] opacity-40 mb-4">The philosophy</p>
            <h2 className="text-4xl md:text-6xl font-serif italic tracking-tight mb-6">
              Connection isn&rsquo;t a numbers game.
            </h2>
            <p className="text-lg opacity-70 leading-relaxed max-w-2xl mx-auto">
              The future of dating isn&rsquo;t about more options — it&rsquo;s about intention.
            </p>
          </motion.div>

          {/* Manifesto + editorial image */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="group relative mt-14 lg:mt-20 rounded-3xl overflow-hidden isolate"
          >
            {/* Image as the canvas for the manifesto */}
            <img
              src={focusIntentionImage}
              alt="Focus and intention"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover object-center grayscale group-hover:grayscale-0 transition-[filter] duration-700 ease-out"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/25" />

            <div className="relative px-8 py-14 sm:px-14 lg:px-20 lg:py-24 max-w-2xl text-white">
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/60 mb-8 inline-flex items-center gap-3">
                <span className="w-8 h-px bg-white/40" /> Less, but better
              </p>

              <p className="text-2xl md:text-4xl font-serif leading-snug">
                We&rsquo;re not here to{' '}
                <span className="italic text-white/50">maximize your options.</span> We&rsquo;re here
                to make{' '}
                <span className="italic underline decoration-white/40 underline-offset-8">
                  one of them count.
                </span>
              </p>

              <p className="mt-8 text-base md:text-lg text-white/70 leading-relaxed max-w-xl">
                Dating apps became casinos of human connection — endless swiping, infinite options,
                no depth. Everyone&rsquo;s burnt out. OneHook enforces one radical constraint: a
                single active connection at a time. When you match, you&rsquo;re locked in.
              </p>

              <p className="mt-8 text-sm text-white/60 italic border-l-2 border-white/30 pl-5">
                &ldquo;The secret of wisdom is knowing what to leave out.&rdquo;
              </p>
            </div>
          </motion.div>

          {/* Old way vs OneHook way */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mt-20 lg:mt-28 grid md:grid-cols-2 rounded-3xl overflow-hidden border border-border"
          >
            <div className="p-8 sm:p-10 lg:p-12 bg-white">
              <p className="text-[11px] uppercase tracking-[0.3em] opacity-40 mb-8">The old way</p>
              <ul className="space-y-4">
                {[
                  'Swipe till your thumb goes numb',
                  '\u201CBuilt to be deleted\u201D\u2026 never is',
                  'A countdown timer just to say hi',
                  'Pay to unblur who already likes you',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-lg opacity-50">
                    <span className="inline-flex w-6 h-6 rounded-full border border-border items-center justify-center shrink-0">
                      <X className="w-3 h-3" />
                    </span>
                    <span className="line-through decoration-1 decoration-text/30">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-8 sm:p-10 lg:p-12 bg-accent text-white">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/50 mb-8">
                The OneHook way
              </p>
              <ul className="space-y-4">
                {[
                  'One connection at a time',
                  'Full, undivided focus',
                  'Real conversation',
                  'Private by default (E2EE)',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-lg">
                    <span className="inline-flex w-6 h-6 rounded-full bg-white/15 items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          <p className="mt-4 text-[10px] uppercase tracking-[0.2em] opacity-30 text-center">
            Not affiliated with any other dating app. Comparisons are our own cheeky opinion.
          </p>

          {/* Core values — numbered, divider-based */}
          <div className="mt-20 lg:mt-28 border-t border-border">
            <div className="grid md:grid-cols-3">
              {[
                {
                  icon: Focus,
                  title: 'Intention',
                  description:
                    'Every action is deliberate. Every match is a statement of purpose. No mindless scrolling.',
                },
                {
                  icon: Lock,
                  title: 'Constraint',
                  description:
                    'Limits breed depth. One connection forces both people to actually show up and invest.',
                },
                {
                  icon: Heart,
                  title: 'Authenticity',
                  description:
                    'Without a safety net of a thousand options, people finally show up as themselves.',
                },
              ].map((value, idx) => (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: idx * 0.1 }}
                  className="group relative p-8 lg:py-12 lg:px-8 border-b last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 border-border overflow-hidden"
                >
                  <span className="absolute top-0 left-0 h-0.5 w-0 bg-accent transition-all duration-500 group-hover:w-full" />
                  <div className="flex items-center justify-between mb-6">
                    <value.icon className="w-6 h-6 text-accent" />
                    <span className="font-mono text-xs opacity-30">0{idx + 1}</span>
                  </div>
                  <h4 className="text-lg font-bold uppercase tracking-[0.15em] mb-3">
                    {value.title}
                  </h4>
                  <p className="opacity-60 leading-relaxed text-sm">{value.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 bg-bg">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-6"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] opacity-40 mb-4">How it works</p>
            <h2 className="text-4xl md:text-6xl font-serif italic tracking-tight mb-6">
              {relationshipMode === 'single' ? 'Three steps. One focus.' : 'Two steps. One person.'}
            </h2>
            <p className="text-lg opacity-70 leading-relaxed max-w-2xl mx-auto">
              {relationshipMode === 'single'
                ? 'The product should feel like the product itself: focused, intentional, impossible to rush. Move through the flow to feel how OneHook narrows attention instead of fragmenting it.'
                : 'Already seeing someone? Use OneHook as a priority-notification messenger \u2014 so the one person who matters always reaches you first, without the noise of another inbox.'}
            </p>

            {/* Single / not-single toggle */}
            <div
              role="tablist"
              aria-label="Choose your relationship status"
              className="inline-flex items-center mt-8 p-1 rounded-full border border-border bg-white"
            >
              {([
                { key: 'single', label: 'Single' },
                { key: 'taken', label: 'Seeing someone' },
              ] as const).map((option) => {
                const isActive = relationshipMode === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleRelationshipModeChange(option.key)}
                    className={`px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-all ${
                      isActive
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text/50 hover:text-text/80'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Stepper: counter + progress timeline + controls */}
          <div className="mt-12 mb-2">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="text-xs uppercase tracking-[0.28em] opacity-50">
                Step{' '}
                <span className="text-accent font-black">
                  {String(activeStep + 1).padStart(2, '0')}
                </span>{' '}
                / {String(howItWorksSteps.length).padStart(2, '0')}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Previous step"
                  onClick={() => scrollToStep(Math.max(activeStep - 1, 0))}
                  disabled={activeStep === 0}
                  className="w-11 h-11 rounded-full border border-border flex items-center justify-center transition-all hover:border-accent hover:bg-accent hover:text-white disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-current disabled:hover:border-border"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next step"
                  onClick={() =>
                    scrollToStep(Math.min(activeStep + 1, howItWorksSteps.length - 1))
                  }
                  disabled={activeStep === howItWorksSteps.length - 1}
                  className="w-11 h-11 rounded-full border border-border flex items-center justify-center transition-all hover:border-accent hover:bg-accent hover:text-white disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-current disabled:hover:border-border"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Clickable labeled progress timeline */}
            <div className="relative" role="tablist" aria-label="How OneHook works steps">
              <div className="absolute left-0 right-0 top-[9px] h-px bg-border" />
              <div
                className="absolute left-0 top-[9px] h-px bg-accent transition-all duration-500 ease-out"
                style={{
                  width: `${(activeStep / (howItWorksSteps.length - 1)) * 100}%`,
                }}
              />
              <div className="relative flex justify-between">
                {howItWorksSteps.map((step, index) => {
                  const isActive = activeStep === index;
                  const isDone = index <= activeStep;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Step ${index + 1}: ${step.label}`}
                      onClick={() => scrollToStep(index)}
                      className="group flex flex-col items-center gap-3 bg-bg px-2 -mx-2"
                    >
                      <span
                        className={`w-[18px] h-[18px] rounded-full border-2 transition-all duration-300 ${
                          isActive
                            ? 'bg-accent border-accent scale-110 ring-4 ring-accent/10'
                            : isDone
                              ? 'bg-accent border-accent'
                              : 'bg-white border-border group-hover:border-accent/50'
                        }`}
                      />
                      <span
                        className={`hidden sm:block text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                          isActive ? 'text-accent' : 'text-text/40 group-hover:text-text/70'
                        }`}
                      >
                        {step.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Carousel rail */}
          <div
            ref={stepsRailRef}
            role="group"
            aria-roledescription="carousel"
            aria-label="How OneHook works"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                scrollToStep(Math.min(activeStep + 1, howItWorksSteps.length - 1));
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                scrollToStep(Math.max(activeStep - 1, 0));
              }
            }}
            className="flex gap-6 overflow-x-auto pt-10 pb-14 px-[calc(50%-41vw)] sm:px-[calc(50%-190px)] lg:px-[calc(50%-230px)] snap-x snap-mandatory scroll-smooth scrollbar-none rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {howItWorksSteps.map((step, index) => {
              const isActive = activeStep === index;
              return (
                <motion.article
                  key={step.id}
                  data-step-card
                  data-step-index={index}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} of ${howItWorksSteps.length}: ${step.label}`}
                  initial={{ opacity: 0, y: 40, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-5% 0px -5% 0px' }}
                  transition={{ duration: 0.8, delay: index * 0.05, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className={`group relative shrink-0 snap-center w-[82vw] sm:w-[380px] lg:w-[460px] rounded-3xl border overflow-hidden bg-white flex flex-col transition-all duration-700 ease-out ${
                    isActive
                      ? 'border-accent shadow-2xl shadow-black/10 -translate-y-2 z-10'
                      : 'border-border opacity-45 scale-[0.97] grayscale'
                  }`}
                >
                  {/* Image banner */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-bg">
                    <img
                      src={step.image}
                      alt={step.alt}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-transparent" />
                    <div className="absolute top-4 left-4 inline-flex items-center rounded-full bg-white/90 px-3 py-1.5 backdrop-blur-sm">
                      <span className="text-[10px] font-black uppercase tracking-[0.24em] text-accent">
                        Step {index + 1} · {step.eyebrow}
                      </span>
                    </div>
                    <div className="absolute top-4 right-4 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-mono tracking-[0.2em] text-white backdrop-blur-sm">
                      {String(index + 1).padStart(2, '0')}/
                      {String(howItWorksSteps.length).padStart(2, '0')}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col p-6 sm:p-7">
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-serif italic text-accent/15 leading-none">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <h3 className="text-2xl md:text-3xl font-serif italic tracking-tight">
                        {step.label}
                      </h3>
                    </div>

                    <p className="mt-4 text-sm leading-relaxed opacity-70">{step.summary}</p>

                    <ul className="mt-6 space-y-2.5 pt-5 border-t border-border/70">
                      {step.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-center gap-3 text-sm font-medium">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/10 text-accent shrink-0">
                            <Check className="w-3 h-3" />
                          </span>
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.article>
              );
            })}
          </div>

          {/* Swipe/keys hint */}
          <p className="text-center text-[10px] uppercase tracking-[0.28em] opacity-30 mt-2">
            Swipe, use the arrows, or press ← / →
          </p>

          {/* Matching intelligence — the science behind a single good match */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10% 0px' }}
            transition={{ duration: 0.7 }}
            className="relative mt-20 lg:mt-28 bg-accent text-white overflow-visible isolate w-screen -ml-[50vw] left-[50%]"
          >
            {/* Parabolic curve top */}
            <div
              className="absolute top-0 left-0 right-0 h-12 sm:h-16 lg:h-20 bg-white -translate-y-full"
              style={{
                clipPath: 'ellipse(100% 100% at 50% 100%)',
              }}
            />

            {/* Parabolic curve bottom */}
            <div
              className="absolute bottom-0 left-0 right-0 h-12 sm:h-16 lg:h-20 bg-white translate-y-full"
              style={{
                clipPath: 'ellipse(100% 100% at 50% 0%)',
              }}
            />

            {/* Soft radial glow accent */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-[0.12] blur-3xl"
              style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
            />

            {/* Content wrapper to maintain centered layout */}
            <div className="max-w-6xl mx-auto px-6 sm:px-12 lg:px-16">
              <div className="relative py-14 lg:py-20">
              <div className="max-w-3xl relative">
                <p className="text-[11px] uppercase tracking-[0.4em] text-white/50 mb-5 inline-flex items-center gap-3">
                  <Sparkles className="w-3.5 h-3.5" /> Under the hood
                </p>
                <h3 className="text-3xl md:text-5xl font-serif italic tracking-tight leading-[1.05]">
                  The science of one good match.
                </h3>
                <p className="mt-6 text-base md:text-lg text-white/70 leading-relaxed">
                  Behind the calm interface is a matching engine built like infrastructure. It reads
                  meaning, not keywords, and optimizes for a two-way spark &mdash; not just whether
                  you&rsquo;d swipe right.
                </p>
                
                {/* Mascot - waves next to the copy, matched to the text block height */}
                <div className="hidden lg:block absolute right-0 top-0 bottom-0 translate-x-full pl-10">
                  <AlienScanner
                    className="h-full aspect-square"
                    primaryColor="#ff69b4"
                    scanColor="#0052CC"
                  />
                </div>
              </div>

              {/* Pipeline strip: Signals → Scoring → Stable match (stacks vertically when > 2 lines) */}
              <AdaptiveFlow
                className="mt-12 text-[10px] font-black uppercase tracking-[0.24em]"
                rowClass="flex flex-wrap items-center gap-3"
                colClass="flex flex-col items-center gap-3"
                parts={[
                  {
                    key: 'signals',
                    content: (
                      <span className="px-4 py-2 rounded-full border border-white/20 bg-white/5">
                        Signals
                      </span>
                    ),
                  },
                  { key: 'a1', rotateWhenStacked: true, content: <ArrowRight className="w-4 h-4 text-white/40" /> },
                  {
                    key: 'scoring',
                    content: (
                      <span className="px-4 py-2 rounded-full border border-white/20 bg-white/5">
                        Reciprocal scoring
                      </span>
                    ),
                  },
                  { key: 'a2', rotateWhenStacked: true, content: <ArrowRight className="w-4 h-4 text-white/40" /> },
                  {
                    key: 'stable',
                    content: (
                      <span className="px-4 py-2 rounded-full border border-white/20 bg-white/5">
                        Stable match
                      </span>
                    ),
                  },
                ]}
              />

              {/* Capability grid */}
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 rounded-2xl overflow-hidden">
                {[
                  {
                    icon: MapPin,
                    title: 'Geospatial discovery',
                    text: 'PostGIS proximity search surfaces people genuinely within reach — never a random global feed.',
                  },
                  {
                    icon: Sparkles,
                    title: 'Semantic embeddings',
                    text: 'Profiles become 1,536-dimension vectors, so we match on meaning and vibe — not keywords.',
                  },
                  {
                    icon: HeartHandshake,
                    title: 'Reciprocal compatibility',
                    text: 'A learned model scores two-way fit: how likely you are to click, not just to be liked.',
                  },
                  {
                    icon: Scale,
                    title: 'Stable matching',
                    text: 'A Gale–Shapley bilateral algorithm keeps everyone from chasing the same few profiles.',
                  },
                  {
                    icon: Gauge,
                    title: 'Engagement-aware',
                    text: 'Dwell time, photos viewed and prompts read quietly sharpen your ranking over time.',
                  },
                  {
                    icon: Target,
                    title: 'Intent-aware',
                    text: 'We read serious vs. casual intent, so a mismatch never outranks a genuine one.',
                  },
                  {
                    icon: Radar,
                    title: 'Fair by design',
                    text: 'An explore/exploit balance gives newer profiles real, daily-rotating visibility.',
                  },
                  {
                    icon: Zap,
                    title: 'No cold starts',
                    text: 'A freshness boost gives new members early exposure from their very first day.',
                  },
                ].map((f, i) => (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className="group bg-accent p-6 hover:bg-white/[0.03] transition-colors"
                  >
                    <f.icon className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
                    <h4 className="mt-4 text-sm font-black uppercase tracking-[0.18em]">
                      {f.title}
                    </h4>
                    <p className="mt-2 text-[13px] leading-relaxed text-white/55">{f.text}</p>
                  </motion.div>
                ))}
              </div>

              {/* Weighted blend — the honest formula, centered; hidden entirely when it wraps to multiple lines */}
              <AdaptiveFlow
                className="mt-10 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50"
                rowClass="flex flex-wrap items-center gap-x-2 gap-y-3"
                colClass="flex flex-col items-center gap-y-3"
                centerHorizontal
                maxLines={1}
                overflowBehavior="hide"
                parts={[
                  { key: 'lead', content: <span className="text-white/40">Final rank =</span> },
                  {
                    key: 'reciprocity',
                    content: (
                      <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70">
                        Reciprocity
                      </span>
                    ),
                  },
                  { key: 'p1', content: <span className="text-white/30">+</span> },
                  {
                    key: 'proximity',
                    content: (
                      <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70">
                        Proximity
                      </span>
                    ),
                  },
                  { key: 'p2', content: <span className="text-white/30">+</span> },
                  {
                    key: 'desirability',
                    content: (
                      <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70">
                        Desirability
                      </span>
                    ),
                  },
                  {
                    key: 'trail',
                    content: <span className="text-white/30">&times; freshness, stratified by intent</span>,
                  },
                ]}
              />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Principles (honest, on-brand figures instead of vanity metrics) */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-y-12 gap-x-8 text-center"
          >
            {[
              { number: '1', label: 'Connection at a time' },
              { number: '0', label: 'Ads & dark patterns' },
              { number: '100%', label: 'End-to-end encrypted' },
              { number: 'Invite', label: 'Members only, by referral' },
            ].map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="text-4xl md:text-6xl font-serif italic text-accent mb-3">
                  {stat.number}
                </div>
                <p className="text-xs uppercase tracking-[0.24em] opacity-50">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Get the App — QR + store badges */}
      <section
        id="get-app"
        ref={getAppRef}
        className="py-24 px-6 bg-accent text-white relative overflow-hidden"
      >
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-white/5 blur-3xl" />

        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 md:gap-16 items-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            style={{ x: appLeftXSpring }}
            className="text-center md:text-left"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 border border-white/25 rounded-full">
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-white/85">
                The OneHook app
              </span>
            </div>

            <h2 className="text-4xl md:text-6xl font-serif italic leading-[1.05] mb-6">
              Your one connection,
              <br />
              in your pocket.
            </h2>

            <p className="text-lg text-white/70 leading-relaxed mb-8 max-w-md mx-auto md:mx-0">
              Fewer notifications, more meaning. Matches, private end-to-end encrypted chat, and
              focus mode — wherever you are.
            </p>

            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
              <a
                href={APP_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-white/25 hover:bg-white hover:text-accent transition-colors"
              >
                <AppleIcon className="w-6 h-6" />
                <span className="text-left leading-tight">
                  <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">
                    Download on the
                  </span>
                  <span className="block text-sm font-bold">App Store</span>
                </span>
              </a>
              <a
                href={APP_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-white/25 hover:bg-white hover:text-accent transition-colors"
              >
                <AndroidIcon className="w-6 h-6" />
                <span className="text-left leading-tight">
                  <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">
                    Get it on
                  </span>
                  <span className="block text-sm font-bold">Google Play</span>
                </span>
              </a>
            </div>

            <p className="mt-6 text-xs text-white/50 italic">
              <span className="hidden md:inline">On your phone? Point your camera at the code.</span>
              <span className="md:hidden">Tap a badge to download.</span>
            </p>
          </motion.div>

          {/* Product visual: floating phone mockup + overlapping QR card with scan beam */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            style={{ x: appRightXSpring }}
            className="relative flex justify-center md:justify-end"
          >
            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="relative"
            >
              {/* soft glow behind phone */}
              <div className="absolute inset-0 -m-6 rounded-[3rem] bg-white/10 blur-2xl" />

              {/* Phone frame */}
              <div className="relative w-[240px] sm:w-[264px] aspect-[9/19] rounded-[2.6rem] border-[10px] border-black bg-black shadow-2xl">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-b-2xl z-20" />
                {/* Screen */}
                <div className="absolute inset-0 m-[2px] rounded-[2.1rem] overflow-hidden bg-white flex flex-col">
                  <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[9px] font-bold text-accent/70">
                    <span>9:41</span>
                    <span className="tracking-[0.2em]">ONEHOOK</span>
                    <span className="w-4 h-2 border border-accent/40 rounded-sm" />
                  </div>

                  {/* Match card */}
                  <div className="px-4">
                    <div className="relative rounded-2xl overflow-hidden aspect-[4/5]">
                      <img
                        src={connectWithPurposeImage}
                        alt=""
                        aria-hidden="true"
                        className="w-full h-full object-cover grayscale"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                      <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-accent">
                        <span className="w-1.5 h-1.5 rounded-full bg-status-hooked animate-pulse" /> Hooked
                      </div>
                      <div className="absolute bottom-3 left-3 text-white">
                        <p className="text-lg font-serif italic leading-none">Ava</p>
                        <p className="text-[9px] uppercase tracking-widest opacity-80">
                          2.3 km · Verified
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Chat teaser */}
                  <div className="px-4 mt-3 space-y-2">
                    <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-sm bg-accent text-white px-3 py-2 text-[10px] leading-snug">
                      If we skipped small talk — what should I ask you?
                    </div>
                    <div className="max-w-[72%] rounded-2xl rounded-bl-sm bg-[#F2F2F2] text-accent px-3 py-2 text-[10px] leading-snug">
                      Ask about the last thing that made me laugh.
                    </div>
                  </div>

                  {/* Focus footer */}
                  <div className="mt-auto px-4 py-3 border-t border-border flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-[0.24em] text-accent/60">
                    <Lock className="w-3 h-3" /> Focus mode · one connection
                  </div>
                </div>
              </div>

              {/* Floating QR card overlapping the phone */}
              <div className="absolute -left-6 sm:-left-16 bottom-10 w-[150px] rounded-2xl bg-white text-accent p-3 shadow-2xl border border-black/5">
                <div className="relative rounded-xl overflow-hidden border border-border p-2 flex items-center justify-center">
                  <QRCodeSVG
                    value={APP_DOWNLOAD_URL}
                    size={118}
                    level="H"
                    marginSize={0}
                    bgColor="#ffffff"
                    fgColor="#1A1A1A"
                    imageSettings={{ src: brandMarkImage, height: 24, width: 24, excavate: true }}
                  />
                  {/* animated scan beam */}
                  <motion.div
                    aria-hidden="true"
                    initial={{ y: '-120%' }}
                    animate={{ y: '120%' }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', repeatType: 'reverse' }}
                    className="pointer-events-none absolute left-0 right-0 h-8 bg-gradient-to-b from-transparent via-status-hooked/50 to-transparent"
                  />
                  {/* scanner corner brackets */}
                  <span className="pointer-events-none absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-status-hooked/70" />
                  <span className="pointer-events-none absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-status-hooked/70" />
                  <span className="pointer-events-none absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-status-hooked/70" />
                  <span className="pointer-events-none absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-status-hooked/70" />
                </div>
                <p className="mt-2 w-full text-center text-[8px] font-black uppercase tracking-[0.2em] opacity-60 inline-flex items-center gap-1 justify-center">
                  <QrCode className="w-3 h-3" /> Scan to install
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-28 px-6 bg-bg relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-accent/5 to-transparent" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 border border-accent/20 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-black uppercase tracking-[0.24em] opacity-70">
              Invite-only · Limited spots
            </span>
          </div>

          <h2 className="text-4xl md:text-6xl font-serif italic tracking-tight mb-8">
            Ready for one real thing?
          </h2>

          <p className="text-lg md:text-xl opacity-60 italic mb-12 max-w-2xl mx-auto">
            Trade a thousand maybes for one yes. Bring an invite code and meet the person actually
            worth your attention.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={goRedeemInvite}
              className="w-full sm:w-auto px-10 py-5 bg-accent text-white text-sm font-black uppercase tracking-[0.3em] hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-3"
            >
              Redeem your invite <ArrowRight className="w-5 h-5" />
            </motion.button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-10 py-5 border border-accent text-accent text-sm font-black uppercase tracking-[0.3em] hover:bg-accent hover:text-white transition-colors"
            >
              I already have an account
            </button>
          </div>

          <p className="mt-8 text-sm opacity-40 italic">
            OneHook is invite-only. Don&rsquo;t have a code? Ask someone you know.
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <SiteFooter />

      {/* Persistent conversion CTA — appears after the hero (sticky-CTA best practice) */}
      <AnimatePresence>
        {showStickyCta && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] sm:w-auto"
          >
            {/* Invisible mirror (always both buttons) — measures whether the
                "Get the app" label wraps to > 1 line at the current width. */}
            <div
              ref={ctaMirrorRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute inset-0 flex items-center gap-3 sm:gap-5 p-2 rounded-full border border-white/10"
            >
              <span className="hidden sm:block portrait:hidden pl-3 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
                One connection. Zero distractions.
              </span>
              <span className="flex-1 sm:flex-none block text-center px-5 py-3 border border-white/40 text-[11px] font-black uppercase tracking-[0.24em] rounded-full">
                <Smartphone className="inline w-4 h-4 mr-2 align-middle" />
                <span ref={ctaAppTextRef} className="align-middle">Get the app</span>
              </span>
              <span className="flex-1 sm:flex-none px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] rounded-full inline-flex items-center justify-center gap-2">
                <span className="hidden sm:inline">Redeem invite</span>
                <span className="sm:hidden">Redeem</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </div>

            <div className="flex items-center gap-3 sm:gap-5 bg-accent text-white p-2 rounded-full shadow-2xl border border-white/10">
              <span className="hidden sm:block portrait:hidden pl-3 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
                One connection. Zero distractions.
              </span>
              <button
                onClick={() => scrollToSection('get-app')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 border border-white/40 text-white text-[11px] font-black uppercase tracking-[0.24em] rounded-full hover:bg-white/10 transition-colors"
              >
                <Smartphone className="w-4 h-4" /> Get the app
              </button>
              {!hideStickyRedeem && (
                <button
                  onClick={goRedeemInvite}
                  className="flex-1 sm:flex-none px-5 py-3 bg-white text-accent text-[11px] font-black uppercase tracking-[0.24em] rounded-full hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
                >
                  <span className="hidden sm:inline">Redeem invite</span>
                  <span className="sm:hidden">Redeem</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Types out `text` one character at a time on mount, with a blinking caret.
 * Respects `prefers-reduced-motion` by rendering the full text instantly. The
 * full string is exposed via aria-label so screen readers announce it once.
 */
function Typewriter({
  text,
  speed = 34,
  startDelay = 350,
}: {
  text: string;
  speed?: number;
  startDelay?: number;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setCount(text.length);
      return;
    }

    setCount(0);
    let i = 0;
    let intervalId = 0;
    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= text.length) window.clearInterval(intervalId);
      }, speed);
    }, startDelay);

    return () => {
      window.clearTimeout(startId);
      window.clearInterval(intervalId);
    };
  }, [text, speed, startDelay]);

  const done = count >= text.length;

  return (
    <span aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      <span
        aria-hidden="true"
        className={`inline-block w-[0.06em] -mb-[0.1em] h-[1em] translate-y-[0.12em] bg-current ml-0.5 ${
          done ? 'animate-pulse' : ''
        }`}
      />
    </span>
  );
}
