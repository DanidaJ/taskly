import { useEffect, useRef, useState } from 'react';
import { motion, MotionConfig, useInView, useReducedMotion } from 'framer-motion';
import { Bot, Clock, Loader2, Moon, Send, Sparkles, User, Zap } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Looping hero animation: messy thoughts typed into the planner chat, AI thinks,
 * task blocks cascade into a day timeline around a peak-energy band and a
 * wind-down boundary. Purely decorative (aria-hidden) — mirrors the in-app
 * PlannerChat / PlanPreview visual language with hardcoded demo data.
 */

const DEMO_INPUT = 'finish the report, gym, emails, call mom, study for exam';

interface DemoTask {
  emoji: string;
  title: string;
  start: string; // HH:MM
  end: string; // HH:MM
  color: string;
  dot: string; // priority dot, app semantics: high=red, medium=amber, low=green
}

const DEMO_TASKS: DemoTask[] = [
  { emoji: '🧠', title: 'Finish report', start: '09:00', end: '11:00', color: 'bg-blue-500', dot: 'bg-red-500' },
  { emoji: '💪', title: 'Gym', start: '12:00', end: '13:00', color: 'bg-green-500', dot: 'bg-amber-500' },
  { emoji: '📋', title: 'Emails & admin', start: '14:00', end: '15:00', color: 'bg-orange-500', dot: 'bg-green-500' },
  { emoji: '🌿', title: 'Call mom', start: '17:30', end: '18:00', color: 'bg-purple-500', dot: 'bg-amber-500' },
  { emoji: '🧠', title: 'Study for exam', start: '19:00', end: '20:30', color: 'bg-blue-500', dot: 'bg-red-500' },
];

const PEAK_START = '09:00';
const PEAK_END = '12:00';
const WIND_DOWN = '21:30';

const DAY_START_MIN = 8 * 60; // timeline window 08:00–23:00
const DAY_END_MIN = 23 * 60;
const DAY_SPAN_MIN = DAY_END_MIN - DAY_START_MIN;
const MIN_BLOCK_H = 24;
const GUTTER_PX = 52;
const TICK_HOURS = [8, 10, 12, 14, 16, 18, 20, 22];

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// The timeline height tracks the viewport so the whole window fits shorter
// laptops (Windows display-scaling + browser chrome can leave <700px tall),
// while capping at a fixed size on taller screens so it never grows huge.
const CANVAS_MAX = 450;
const CANVAS_MIN = 300;
const canvasHForViewport = (vh: number) =>
  Math.round(Math.min(CANVAS_MAX, Math.max(CANVAS_MIN, vh * 0.46)));

const TOTAL_MIN = DEMO_TASKS.reduce((sum, t) => sum + toMin(t.end) - toMin(t.start), 0);
const SUMMARY = `${DEMO_TASKS.length} tasks · ${TOTAL_MIN / 60}h`;

const PHASE_ORDER = ['typing', 'sending', 'thinking', 'revealing', 'placing', 'done', 'resetting'] as const;
type Phase = (typeof PHASE_ORDER)[number];

const TYPE_MS = 30;
const DURATIONS: Record<Phase, number> = {
  typing: DEMO_INPUT.length * TYPE_MS + 250,
  sending: 450,
  thinking: 1200,
  revealing: 600,
  placing: 2400,
  done: 1300,
  resetting: 450,
};

const RANK = Object.fromEntries(PHASE_ORDER.map((p, i) => [p, i])) as Record<Phase, number>;
const atLeast = (phase: Phase, target: Phase) => RANK[phase] >= RANK[target];

function useHeroLoop(active: boolean, startDelay: number) {
  const [phase, setPhase] = useState<Phase>('typing');
  const [cycle, setCycle] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  // Hold at an empty, blinking-cursor 'typing' state until the window has
  // finished sliding in — then the loop begins (the entrance handoff).
  const [armed, setArmed] = useState(startDelay === 0);

  useEffect(() => {
    if (!active || armed) return;
    const id = window.setTimeout(() => setArmed(true), startDelay);
    return () => window.clearTimeout(id);
  }, [active, armed, startDelay]);

  const running = active && armed;

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => {
      if (phase === 'resetting') {
        setTypedCount(0);
        setCycle((c) => c + 1);
        setPhase('typing');
      } else {
        setPhase(PHASE_ORDER[RANK[phase] + 1]);
      }
    }, DURATIONS[phase]);
    return () => window.clearTimeout(id);
  }, [phase, running]);

  useEffect(() => {
    if (!running || phase !== 'typing') return;
    const id = window.setInterval(() => {
      setTypedCount((c) => Math.min(c + 1, DEMO_INPUT.length));
    }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [phase, running]);

  return { phase, cycle, typedText: DEMO_INPUT.slice(0, typedCount) };
}

function ChatPane({ phase, typedText, instant }: { phase: Phase; typedText: string; instant: boolean }) {
  const thinking = phase === 'thinking';
  const busy = phase === 'sending' || phase === 'thinking';

  return (
    <div className="flex flex-col rounded-apple-lg border border-white/60 bg-white/70 backdrop-blur-xl shadow-apple p-4">
      {/* Compact planner header (mirrors the in-app PlannerChat header) */}
      <div className="flex items-center gap-2 pb-3 mb-1 border-b border-gray-200/70">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-blue-600" />
        </div>
        <span className="text-sm font-semibold text-gray-900">AI Planner</span>
      </div>

      <div className="flex-1 flex flex-col justify-end gap-3 mb-3 min-h-[120px]">
        {atLeast(phase, 'sending') && (
          <motion.div
            initial={instant ? false : { opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="flex gap-3 flex-row-reverse"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="bg-blue-600 text-white p-3 rounded-2xl text-sm max-w-[85%]">{DEMO_INPUT}</div>
          </motion.div>
        )}

        {atLeast(phase, 'thinking') && (
          <motion.div
            initial={instant ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-3">
              {thinking ? (
                <div className="flex items-center gap-2 text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              ) : (
                <motion.div
                  initial={instant ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-gray-900"
                >
                  <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="text-sm">Here's your plan for today</span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Faux chat input — divs, not form controls, so no tab stops */}
      <div className="relative">
        <div className="min-h-[80px] rounded-apple border border-gray-200 bg-white/90 p-3 pr-12 text-sm text-gray-900">
          {phase === 'typing' ? (
            <>
              {typedText}
              <span className="ml-0.5 inline-block w-0.5 h-4 align-middle bg-blue-500 animate-pulse" />
            </>
          ) : (
            <span className="text-gray-400">Tell me about your tasks for today...</span>
          )}
        </div>
        <motion.div
          animate={{ scale: phase === 'sending' ? 0.88 : 1 }}
          className="absolute right-3 bottom-3 rounded-lg bg-blue-600 p-2 text-white shadow-sm"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </motion.div>
      </div>
    </div>
  );
}

function TimelinePane({ phase, instant, canvasH }: { phase: Phase; instant: boolean; canvasH: number }) {
  const pxPerMin = canvasH / DAY_SPAN_MIN;
  const y = (t: string) => (toMin(t) - DAY_START_MIN) * pxPerMin;
  const peakTop = y(PEAK_START);
  const peakHeight = y(PEAK_END) - peakTop;
  const windDownY = y(WIND_DOWN);

  return (
    <div className="rounded-apple-lg border border-white/60 bg-white/70 backdrop-blur-xl shadow-apple p-4">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-gray-900">
          {atLeast(phase, 'done') ? SUMMARY : 'Today'}
        </span>
      </div>

      <div className="relative mt-3" style={{ height: canvasH }}>
        {/* Hour tick lines + gutter labels */}
        {TICK_HOURS.map((hour) => (
          <div key={hour} className="absolute left-0 right-0" style={{ top: (hour * 60 - DAY_START_MIN) * pxPerMin }}>
            <div className="flex items-center">
              <span className="w-11 pr-2 text-[10px] tabular-nums text-gray-400 text-right">
                {String(hour).padStart(2, '0')}:00
              </span>
              <div className="flex-1 border-t border-gray-100" />
            </div>
          </div>
        ))}

        {/* Peak energy band */}
        {atLeast(phase, 'revealing') && (
          <motion.div
            initial={instant ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="absolute rounded-lg bg-amber-400/10 border border-amber-300/40"
            style={{ top: peakTop, height: peakHeight, left: GUTTER_PX, right: 0 }}
          >
            {phase === 'placing' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ delay: 0.35, duration: 0.9 }}
                className="absolute inset-0 rounded-lg bg-amber-400/30"
              />
            )}
            <div className="absolute bottom-1 right-1.5 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-medium text-amber-600">Peak energy</span>
            </div>
          </motion.div>
        )}

        {/* Wind-down boundary */}
        {atLeast(phase, 'revealing') && (
          <motion.div
            initial={instant ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div
              className="absolute border-t border-dashed border-indigo-300"
              style={{ top: windDownY, left: GUTTER_PX, right: 0 }}
            />
            <div
              className="absolute rounded-b-lg bg-indigo-500/[0.05]"
              style={{ top: windDownY, height: canvasH - windDownY, left: GUTTER_PX, right: 0 }}
            />
            <div className="absolute flex items-center gap-1" style={{ top: windDownY + 4, right: 6 }}>
              <Moon className="w-3 h-3 text-indigo-500" />
              <span className="text-[10px] font-medium text-indigo-500">Wind-down · {WIND_DOWN}</span>
            </div>
          </motion.div>
        )}

        {/* Task blocks */}
        {atLeast(phase, 'placing') &&
          DEMO_TASKS.map((task, i) => {
            const top = y(task.start);
            const height = Math.max(MIN_BLOCK_H, (toMin(task.end) - toMin(task.start)) * pxPerMin);
            const compact = height < 40;
            return (
              <motion.div
                key={task.title}
                initial={instant ? false : { opacity: 0, y: -10, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26, delay: instant ? 0 : i * 0.45 }}
                className={clsx('absolute rounded-lg text-white shadow-sm overflow-hidden', task.color)}
                style={{ top, height, left: GUTTER_PX, right: 0 }}
              >
                <div className="h-full px-2 py-1 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white/50', task.dot)} />
                    <span className="text-xs font-semibold truncate">
                      {task.emoji} {task.title}
                    </span>
                  </div>
                  {!compact && (
                    <span className="text-[10px] tabular-nums text-white/85 pl-3.5">
                      {task.start}–{task.end}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}

export function HeroPlannerAnimation({ startDelay = 0 }: { startDelay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduced = useReducedMotion();
  const loop = useHeroLoop(inView && !reduced, startDelay);
  const phase: Phase = reduced ? 'done' : loop.phase;

  const instant = !!reduced;

  // Timeline scales with viewport height so the window fits shorter laptops.
  const [canvasH, setCanvasH] = useState(CANVAS_MAX);
  useEffect(() => {
    const compute = () => setCanvasH(canvasHForViewport(window.innerHeight));
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div ref={ref} aria-hidden="true" className="w-full">
        <motion.div
          key={loop.cycle}
          initial={instant ? false : { opacity: 0 }}
          animate={{ opacity: phase === 'resetting' ? 0 : 1 }}
          transition={{ duration: 0.35 }}
          className="grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-stretch"
        >
          <ChatPane phase={phase} typedText={loop.typedText} instant={instant} />
          <TimelinePane phase={phase} instant={instant} canvasH={canvasH} />
        </motion.div>
      </div>
    </MotionConfig>
  );
}
