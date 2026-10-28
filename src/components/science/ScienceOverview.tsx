import { motion, useReducedMotion } from 'motion/react';
import { hideMrOneHook } from '../Chatbot/ChatbotWidget';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import {
  Accent,
  ENGINE_META,
  Kicker,
  type ChapterDef,
  type ScienceChapterId,
} from './ScienceUi';

const OVERVIEW_DETAILS: Record<ScienceChapterId, { body: string; color: string }> = {
  signal: { body: 'A quiet moment becomes a signal.', color: ENGINE_META.engagement.deep },
  journey: { body: 'It travels only where it belongs.', color: ENGINE_META.rhythm.deep },
  minds: { body: 'Six small questions listen.', color: ENGINE_META.meaning.deep },
  time: { body: 'Moments become a pattern.', color: ENGINE_META.rhythm.deep },
  'mr-onehook': { body: 'A request becomes an introduction.', color: ENGINE_META.wish.deep },
  promises: { body: 'Your boundaries hold around it all.', color: '#5E6670' },
};

/** A connected story index, not a second set of chapter cards. */
export function ScienceOverview({
  chapters,
  onSelect,
}: {
  chapters: readonly ChapterDef[];
  onSelect: (id: ScienceChapterId) => void;
}) {
  const reduce = useReducedMotion();

  return (
    <section
      {...hideMrOneHook}
      id="science-overview"
      aria-labelledby="science-overview-title"
      className="relative isolate scroll-mt-[69px] overflow-hidden px-5 pb-[6.5rem] pt-14 sm:px-6 sm:pb-36 sm:pt-20 lg:pb-40"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-[42rem] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(159,177,232,0.16), rgba(227,166,174,0.08) 45%, transparent 72%)',
        }}
      />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-6xl"
      >
        <div className="relative text-center">
          <Kicker>The complete story</Kicker>
          <h2
            id="science-overview-title"
            className="mt-4 text-3xl font-light leading-[1.1] tracking-[-0.025em] sm:text-5xl"
          >
            One moment. One <Accent>continuous story</Accent>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base font-light leading-relaxed text-black/55">
            Start at the beginning, or enter wherever you are curious.
          </p>
        </div>

        <div className="relative mt-10">
          <ol className="relative mx-auto grid max-w-4xl grid-cols-3 gap-y-2 py-2">
            {chapters.map((chapter) => {
              const details = OVERVIEW_DETAILS[chapter.id];
              return (
                <li key={chapter.id} className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelect(chapter.id)}
                    {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' })}
                    className="group relative flex h-full min-h-36 w-full flex-col items-center rounded-2xl px-1.5 py-5 text-center transition-colors hover:bg-black/[0.018] sm:px-4 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1F3A6B]/35 sm:min-h-40"
                    aria-label={`Chapter ${chapter.number}, ${chapter.title}: ${details.body}`}
                  >
                    <span
                      className="relative z-10 grid h-8 w-8 place-items-center rounded-full border bg-white font-mono text-[10px] transition-transform duration-300 group-hover:scale-110"
                      style={{ borderColor: `${details.color}66`, color: details.color }}
                      aria-hidden="true"
                    >
                      {chapter.number}
                    </span>
                    <h3 className="mt-4 text-sm font-light tracking-[-0.01em] text-[#0A0B10] sm:text-base">
                      <span className="sr-only">Chapter {chapter.number}: </span>
                      {chapter.title}
                    </h3>
                    <p className="mt-1.5 max-w-[13rem] text-[11px] sm:text-xs font-light leading-relaxed text-black/45">
                      {details.body}
                    </p>
                    <motion.span
                      aria-hidden="true"
                      className="mt-auto h-1 w-1 rounded-full"
                      style={{ background: details.color }}
                      whileHover={reduce ? undefined : { scale: 2.2 }}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </motion.div>
    </section>
  );
}
