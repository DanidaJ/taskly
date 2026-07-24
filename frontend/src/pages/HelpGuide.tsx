import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Inbox,
  FolderKanban,
  Calendar,
  Timer,
  Moon,
  BookOpen,
  BarChart3,
  Settings as SettingsIcon,
  Bell,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

interface Section {
  icon: typeof Sparkles;
  title: string;
  intro?: string;
  steps: string[];
  tip?: string;
  to?: { label: string; path: string };
}

const sections: Section[] = [
  {
    icon: Sparkles,
    title: 'AI Planner — build your day in one message',
    intro: 'The core loop. Tell it your day in plain English; it does the scheduling.',
    steps: [
      'Open AI Planner and type everything in one go — e.g. "finish the report, two client calls, gym at lunch, reply to emails."',
      'It splits that into separate tasks, estimates how demanding each is, and places them around your fixed commitments, your peak-focus hours, and your sleep window.',
      'Review the suggested schedule, then tap Apply Plan to put it on your calendar.',
      'Want changes? Just say so — "make the report 2 hours", "move gym to 6pm", "I only have 3 tasks today." Then Apply.',
    ],
    tip: 'It never schedules during a commitment or after your wind-down time, and it won\'t plan a slot that\'s already passed.',
    to: { label: 'Open AI Planner', path: '/app/planner' },
  },
  {
    icon: Inbox,
    title: 'Backlog — capture now, schedule later',
    intro: 'Not everything needs a time today. Park it and schedule when you\'re ready.',
    steps: [
      'Save a task for "later" from the + Quick Add button (choose "Add to backlog"), or on the Backlog page.',
      'Schedule it two ways: (1) on the Backlog page, open the item → Schedule → pick a date, and optionally a time; or',
      '(2) let the AI pull from it — in the AI Planner say "schedule two things from my backlog today" and it places them for you.',
      'Once a backlog item is scheduled, it moves out of the backlog and onto your calendar.',
    ],
    to: { label: 'Open Backlog', path: '/app/backlog' },
  },
  {
    icon: FolderKanban,
    title: 'Projects — big, multi-session work',
    intro: 'A project is bigger than one task (e.g. "Build portfolio site"), tracked by total hours.',
    steps: [
      'Create one on Backlog → Projects. Use "Estimate with AI" if you\'re not sure how many hours it\'ll take.',
      'Advance it a chunk at a time: in the AI Planner say "schedule 2 hours of <project name> today."',
      'Make progress count: open that task on your Schedule and, under "Project", link it to the project. Completing a linked task logs its hours — the project\'s progress bar moves.',
      'Click a project\'s name to see its progress, its subtasks (done/pending), and every linked session — upcoming, ongoing, and past.',
    ],
    tip: 'Linking is manual on purpose, so hours are always logged to the right project.',
    to: { label: 'Open Projects', path: '/app/backlog' },
  },
  {
    icon: Calendar,
    title: 'Your schedule — run the day',
    intro: 'Your calendar in day or week view. Everything you act on lives here.',
    steps: [
      'Click any task to start it, mark it complete, reschedule it, or link it to a project.',
      'Missed something? Open it and reschedule to the next free slot, tomorrow, or a custom time.',
      'Add a task yourself with the + button: "Schedule now" for a timed task, or "Add to backlog."',
      'You can\'t schedule a slot that\'s already fully over. A task that\'s already underway is added as "in progress" so you can finish it.',
    ],
    to: { label: 'Open Schedule', path: '/app/schedule' },
  },
  {
    icon: Timer,
    title: 'Focus Timer',
    steps: [
      'A Pomodoro timer for deep work. Start it straight from a scheduled task, or on its own.',
      'Finished sessions feed your analytics and help the AI learn your real pace over time.',
    ],
    to: { label: 'Open Focus Timer', path: '/app/focus' },
  },
  {
    icon: Moon,
    title: 'Sleep',
    steps: [
      'Log last night\'s sleep in a couple of taps.',
      'Set your sleep schedule on the Sleep tab — your wake and sleep times tell the AI when you\'re awake, so it never plans work while you should be resting.',
    ],
    to: { label: 'Open Sleep', path: '/app/sleep' },
  },
  {
    icon: BookOpen,
    title: 'Reflection',
    steps: [
      'End the day by rating your energy and focus and jotting a quick note.',
      'You\'ll get a short AI reflection — and over time it sharpens tomorrow\'s plans.',
    ],
    to: { label: 'Open Reflection', path: '/app/reflection' },
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    steps: [
      'A weekly view of tasks completed, focus time, your streak, and a productivity score — so you can see what\'s actually working.',
    ],
    to: { label: 'Open Analytics', path: '/app/analytics' },
  },
  {
    icon: SettingsIcon,
    title: 'Settings — teach the planner about you',
    intro: 'A few one-time settings make every plan smarter. Defaults are fine to start.',
    steps: [
      'Energy profile: your peak-focus hours — the AI puts demanding work there.',
      'Commitments: fixed blocked time (work, class, standing meetings) the AI plans around.',
      'Routines: recurring tasks that get auto-added to your day.',
    ],
    to: { label: 'Open Settings', path: '/app/settings' },
  },
  {
    icon: Bell,
    title: 'Notifications',
    steps: [
      'Turn on push per device in Settings → Notifications.',
      'Get a reminder before each task (choose how many minutes ahead), plus an optional daily summary and evening reflection nudge.',
      'Set quiet hours to stay silent overnight.',
      'Works on desktop browsers and Android. On iPhone, add Taskly to your Home Screen first (iOS 16.4+), then open it from there.',
    ],
    to: { label: 'Open Settings', path: '/app/settings' },
  },
];

export default function HelpGuide() {
  usePageMeta('Help & Guide — Taskly');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-apple-lg bg-gradient-to-br from-blue-500/20 to-purple-600/20">
          <Lightbulb className="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Help &amp; Guide</h1>
          <p className="text-gray-600 mt-1">How each part of Taskly works, and how they fit together.</p>
        </div>
      </div>

      {/* Start-here callout */}
      <div className="glass-card bg-gradient-to-r from-blue-600/10 to-purple-600/10 border-blue-500/20">
        <div className="flex items-start gap-3">
          <Sparkles className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Start here: the 60-second plan</h2>
            <p className="text-sm text-gray-700 mt-1">
              Open the <strong>AI Planner</strong>, type your tasks for the day in plain English, review the
              suggested schedule, and tap <strong>Apply</strong>. That's the whole daily ritual — everything
              below is an optional amplifier that makes those plans smarter.
            </p>
            <Link
              to="/app/planner"
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Open the AI Planner <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3) }}
            className="glass-card"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2 rounded-apple bg-blue-500/10 shrink-0">
                <s.icon className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{s.title}</h2>
            </div>

            {s.intro && <p className="text-sm text-gray-600 mb-3">{s.intro}</p>}

            <ul className="space-y-2">
              {s.steps.map((step, j) => (
                <li key={j} className="flex gap-2.5 text-sm text-gray-700 leading-relaxed">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>

            {s.tip && (
              <div className="mt-3 flex items-start gap-2 rounded-apple bg-amber-50 border border-amber-100 px-3 py-2">
                <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900">{s.tip}</p>
              </div>
            )}

            {s.to && (
              <Link
                to={s.to.path}
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {s.to.label} <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </motion.div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-500 pt-2">
        Still stuck? Head to Settings to fine-tune your profile — or just start with the AI Planner and adjust as you go.
      </p>
    </div>
  );
}
