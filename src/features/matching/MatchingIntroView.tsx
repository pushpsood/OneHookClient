import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

export const MATCHING_INTRO_COPY = {
  title: 'Matching',
  body: 'Matching is off. Turn it on to build a matching profile and meet new people. Your chats and hooks stay as they are.',
  turnOn: 'Turn on matching',
  shouldIJoin: 'Should I sign up for matching?',
  erasing: 'Matching is being turned off. You can turn it on again once that finishes.',
  guideTitle: 'Should I sign up for matching?',
  guideBody: 'We’re building a short guide to help you decide. Coming soon.',
} as const;

/**
 * The Matching tab of a chat-only member (screen MATCHING_INTRO). It explains matching and offers the
 * same entry into the matching profile builder that Profile and Settings use. It calls nothing itself:
 * no /matching/* route may be called while matching is off.
 */
export function MatchingIntroView({
  erasing,
  onTurnOn,
}: {
  /** Matching is ERASING after an opt-out: turning it on waits until that finishes. */
  erasing: boolean;
  /** Opens the matching profile builder. */
  onTurnOn: () => void;
}) {
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setGuideOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guideOpen]);

  return (
    <section
      aria-labelledby="matching-intro-title"
      className="max-w-md mx-auto py-12 space-y-6 text-text"
      data-testid="matching-intro"
    >
      <div className="w-14 h-14 rounded-full border-2 border-accent flex items-center justify-center">
        <Heart className="w-6 h-6 text-accent" aria-hidden="true" />
      </div>
      <div className="space-y-3">
        <h1 id="matching-intro-title" className="text-2xl font-bold">
          {MATCHING_INTRO_COPY.title}
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">{MATCHING_INTRO_COPY.body}</p>
      </div>

      {erasing && (
        <p className="text-xs text-text-secondary leading-relaxed" role="status">
          {MATCHING_INTRO_COPY.erasing}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onTurnOn}
          disabled={erasing}
          {...trackProps(UiElement.MATCHING_INTRO_TURN_ON)}
          className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {MATCHING_INTRO_COPY.turnOn}
        </button>
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          {...trackProps(UiElement.MATCHING_INTRO_SHOULD_I_JOIN)}
          className="w-full py-3 border border-border text-sm font-semibold rounded-xl hover:bg-surface-hover transition-colors cursor-pointer"
        >
          {MATCHING_INTRO_COPY.shouldIJoin}
        </button>
      </div>

      {guideOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setGuideOpen(false)}
          data-track-exempt="backdrop: click-away that closes the matching guide; the OK control (matching_intro.should_i_join dismiss) is tracked."
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="matching-guide-title"
            className="max-w-sm w-full bg-surface-card text-text border border-border p-6 space-y-4 shadow-2xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            <h2 id="matching-guide-title" className="text-lg font-bold">
              {MATCHING_INTRO_COPY.guideTitle}
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">{MATCHING_INTRO_COPY.guideBody}</p>
            <button
              type="button"
              autoFocus
              onClick={() => setGuideOpen(false)}
              {...trackProps(UiElement.MATCHING_INTRO_SHOULD_I_JOIN, { action: 'dismiss' })}
              className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
