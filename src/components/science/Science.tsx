import { motion, useScroll, useSpring } from 'motion/react';
import { STORY_PAGE_TITLES, SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { Seo } from '../common/Seo';
import { ROUTE_SEO } from '../../config/seo-routes';
import { BRAND, ENGINE_META, type ChapterDef } from './ScienceUi';
import { ScienceHero } from './ScienceHero';
import { ScienceOverview } from './ScienceOverview';
import { ScienceProcess } from './ScienceProcess';

/**
 * /science: one moment moving through the complete OneHook process.
 *
 * The hero introduces the six minds. The overview provides direct chapter links. From "A moment"
 * onward, one persistent diagram changes emphasis while the six semantic chapter sections scroll
 * beside it. The process stays spatially stable; only its state and annotations change.
 */

const CHAPTERS: ChapterDef[] = [
  { id: 'signal', number: '01', title: 'A moment' },
  { id: 'journey', number: '02', title: 'The journey' },
  { id: 'minds', number: '03', title: 'Six minds' },
  { id: 'time', number: '04', title: 'Time & intent' },
  { id: 'mr-onehook', number: '05', title: 'Mr OneHook' },
  { id: 'promises', number: '06', title: 'Promises' },
];

function scrollToId(id: string) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** Thin reading-progress bar, also shared by the Messenger page. */
export function ProgressBar({ background }: { background?: string } = {}) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden="true"
      className="fixed left-0 right-0 top-0 z-50 h-[2px] origin-center"
      style={{
        scaleX,
        background:
          background ??
          `linear-gradient(90deg, ${ENGINE_META.engagement.color}, ${BRAND.silver} 50%, ${ENGINE_META.meaning.color})`,
      }}
    />
  );
}

export function Science() {
  return (
    <div className="min-h-screen" style={{ background: BRAND.paper }}>
      <Seo {...ROUTE_SEO['/science']} path="/science" />
      <ProgressBar />
      <SiteHeader pageTitle="Science" fitTitles={STORY_PAGE_TITLES} />

      <main>
        <ScienceHero onFollow={() => scrollToId('science-overview')} />
        <ScienceOverview chapters={CHAPTERS} onSelect={scrollToId} />
        <ScienceProcess chapters={CHAPTERS} />
      </main>

      <SiteFooter />
    </div>
  );
}
