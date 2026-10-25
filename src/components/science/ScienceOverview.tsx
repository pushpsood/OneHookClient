import { motion, useReducedMotion } from 'motion/react';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import {
  Accent,
  ENGINE_META,
  Kicker,
  type ChapterDef,
  type ScienceChapterId,
} from './ScienceUi';

const OVERVIEW_DETAILS: Record<ScienceChapterId, { body: string; color: string }> = {
  signal: { body: 'What does a pause on a profile really say?', color: ENGINE_META.engagement.deep },
  journey: { body: 'Where does that moment go next?', color: '#806328' },
  minds: { body: 'Why three small minds, not one big algorithm?', color: ENGINE_META.meaning.deep },
  time: { body: 'Can timing reveal what you really want?', color: ENGINE_META.rhythm.deep },
  'mr-onehook': { body: 'Who helps you think it through?', color: ENGINE_META.engagement.deep },
  promises: { body: 'What is OneHook never allowed to do?', color: '#5E6670' },
};

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
      id="science-overview"
      aria-labelledby="science-overview-title"
      className="relative scroll-mt-20 overflow-hidden bg-[#FAFAF8] px-5 py-12 sm:px-6 sm:py-16"
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
        {/* The heading spans the full container width; only the supporting line stays narrow. */}
        <div className="text-center">
          <Kicker>The complete story</Kicker>
          <h2
            id="science-overview-title"
            className="mt-4 text-3xl font-light leading-[1.1] tracking-[-0.025em] sm:text-5xl"
          >
            Six chapters. One <Accent>transparent system</Accent>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base font-light leading-relaxed text-black/55">
            Six questions. Pick the one you are most curious about.
          </p>
        </div>

        <ol className="mx-auto mt-8 grid max-w-[20rem] gap-3 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3">
          {chapters.map((chapter) => {
            const details = OVERVIEW_DETAILS[chapter.id];
            return (
              <li key={chapter.id} className="h-full">
                <button
                  type="button"
                  onClick={() => onSelect(chapter.id)}
                  {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' })}
                  className="group flex h-full w-full flex-col items-center rounded-[20px] border border-black/[0.08] bg-white px-5 py-5 text-center sm:p-6 shadow-[0_24px_60px_-48px_rgba(10,11,16,0.5)] transition-all hover:-translate-y-1 hover:border-black/15 hover:shadow-[0_32px_70px_-45px_rgba(10,11,16,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A6B]/40 motion-reduce:transform-none"
                  aria-label={`Chapter ${chapter.number}, ${chapter.title}: ${details.body}`}
                >
                  {/* Number between two hairlines, with the chapter name on its own line below. */}
                  <span className="flex w-full items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-black/[0.08]" />
                    <span className="text-xs font-normal tabular-nums tracking-[0.08em]" style={{ color: details.color }}>
                      {chapter.number}
                    </span>
                    <span className="h-px flex-1 bg-black/[0.08]" />
                  </span>
                  <h3 className="mt-3 text-lg font-light tracking-[-0.01em] text-[#0A0B10]">
                    <span className="sr-only">Chapter {chapter.number}: </span>
                    {chapter.title}
                  </h3>
                  <p className="mt-1.5 text-sm font-light leading-relaxed text-black/55">
                    {details.body}
                  </p>
                  <span
                    className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[9px] font-semibold uppercase tracking-[0.24em]"
                    style={{ color: details.color }}
                  >
                    Explore chapter
                    <span aria-hidden="true" className="text-xs transition-transform group-hover:translate-y-0.5">
                      ↓
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mx-auto mt-6 max-w-xl text-center text-xs font-light italic leading-relaxed text-black/45">
          Illustration only. The real system is far more complex than this.
        </p>
      </motion.div>
    </section>
  );
}
