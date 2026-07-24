import { Brain } from 'lucide-react';
import { HeroPlannerAnimation } from '../../components/landing/HeroPlannerAnimation';

/**
 * Dev-only capture stage for scripts/capture-hero.mjs.
 *
 * Renders the hero animation alone, inside the same "fake browser window"
 * chrome used on the real homepage, centered on a fixed-size canvas with no
 * nav/footer/scroll — so a Playwright viewport of exactly this size produces
 * a clean video/GIF with nothing to crop.
 *
 * A branded header (logo + wordmark + tagline) sits above the window — social
 * platforms strip away page titles/URLs, so the clip needs to identify itself
 * on its own once it's out of context in a feed or a DM.
 *
 * `startDelay={0}` skips the scroll-entrance handoff so the loop starts the
 * instant this page mounts. The animation itself exposes
 * `data-hero-phase` / `data-hero-cycle` on its root element so the capture
 * script can detect "one full loop finished" instead of guessing a duration.
 */
export default function CaptureHero() {
  return (
    <div className="w-[1280px] h-[720px] flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 shadow-sm">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <span className="text-4xl font-bold gradient-text-blue font-heading">Taskly</span>
        </div>
        <p className="text-base text-gray-500">Plan smarter, not harder.</p>
      </div>

      <div className="w-[1180px] rounded-2xl overflow-hidden border border-gray-200 shadow-apple-xl bg-white">
        <div className="bg-white/90 backdrop-blur p-4 border-b border-gray-200 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-4 text-sm text-gray-600">Taskly — AI Planner</span>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-5">
          <HeroPlannerAnimation startDelay={0} />
        </div>
      </div>
    </div>
  );
}
