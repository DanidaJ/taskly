import { motion } from 'framer-motion';
import {
  Brain,
  MessageSquare,
  Calendar,
  Timer,
  Moon,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingLayout } from '../../components/landing/LandingLayout';
import { usePageMeta } from '../../hooks/usePageMeta';

const steps = [
  {
    number: '01',
    icon: MessageSquare,
    title: 'Tell Us Your Tasks',
    description:
      'Simply type your tasks in natural language. No rigid forms or categories required.',
    example: '"Finish project proposal, gym, 2 client calls, review documents"',
    color: 'primary',
  },
  {
    number: '02',
    icon: Brain,
    title: 'AI Creates Your Plan',
    description:
      'Our AI analyzes task complexity, your energy patterns, and preferences to create the optimal schedule.',
    example: 'Deep work scheduled for peak hours, meetings grouped, breaks included',
    color: 'accent',
  },
  {
    number: '03',
    icon: Calendar,
    title: 'View & Adjust',
    description:
      'See your personalized schedule on an interactive calendar. Drag and drop to customize if needed.',
    example: 'Visual time blocks with color-coded categories',
    color: 'purple',
  },
  {
    number: '04',
    icon: Timer,
    title: 'Execute with Focus',
    description:
      'Use the built-in focus timer to work through tasks. Track your progress in real-time.',
    example: 'Pomodoro sessions linked to your scheduled tasks',
    color: 'green',
  },
  {
    number: '05',
    icon: Moon,
    title: 'Track Your Rhythm',
    description:
      'Log sleep quality and energy levels. The AI learns and improves your schedules over time.',
    example: 'Better sleep = smarter scheduling recommendations',
    color: 'blue',
  },
  {
    number: '06',
    icon: BarChart3,
    title: 'Review & Improve',
    description:
      'Check your analytics, complete daily reflections, and continuously optimize your productivity.',
    example: 'Weekly insights show your progress and patterns',
    color: 'orange',
  },
];

const colorClasses = {
  primary: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-600',
    border: 'border-blue-500/30',
    line: 'bg-blue-500',
  },
  accent: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-600',
    border: 'border-purple-500/30',
    line: 'bg-purple-500',
  },
  purple: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    line: 'bg-purple-500',
  },
  green: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    line: 'bg-green-500',
  },
  blue: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    line: 'bg-blue-500',
  },
  orange: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    line: 'bg-orange-500',
  },
};

const faqs = [
  {
    question: 'How does the AI understand my tasks?',
    answer:
      'Our AI uses natural language processing to understand task descriptions, estimate effort, and categorize by cognitive load (deep focus, light focus, admin, physical). It learns from your feedback to improve over time.',
  },
  {
    question: 'Can I override the AI suggestions?',
    answer:
      'Absolutely! The AI creates a starting point, but you have full control. Drag and drop to rearrange, edit durations, or add/remove tasks as needed.',
  },
  {
    question: 'How does sleep tracking help?',
    answer:
      'Quality sleep affects your cognitive performance. By tracking sleep, the AI can schedule demanding tasks when you\'re well-rested and lighter tasks on tired days.',
  },
  {
    question: 'Is my data used to train AI models?',
    answer:
      'No. Your personal data is never used to train external AI models. The AI personalization happens locally for your account only.',
  },
  {
    question: 'Can I use Taskly on mobile?',
    answer:
      'Yes! Taskly is a Progressive Web App (PWA) that works great on mobile browsers. You can even install it to your home screen for app-like experience.',
  },
];

export function HowItWorks() {
  usePageMeta(
    'How It Works — Taskly',
    'From brain-dump to a schedule built around your energy: see how Taskly turns your tasks into an AI-planned day in a few simple steps.',
  );
  return (
    <LandingLayout>
      {/* Header */}
      <section className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 text-sm font-medium mb-6"
          >
            <Sparkles className="w-4 h-4" />
            Simple Process
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6 font-heading"
          >
            How Taskly{' '}
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-purple-400 bg-clip-text text-transparent bg-[length:200%_auto]">
              Works
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-600 max-w-2xl mx-auto"
          >
            From task input to productivity insights in six simple steps. Let AI
            handle the planning while you focus on doing.
          </motion.p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-green-500 hidden md:block" />

            <div className="space-y-12">
              {steps.map((step, index) => {
                const colors = colorClasses[step.color as keyof typeof colorClasses];

                return (
                  <motion.div
                    key={step.number}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="relative flex gap-8"
                  >
                    {/* Step indicator */}
                    <div className="hidden md:flex flex-col items-center">
                      <div
                        className={`w-16 h-16 rounded-2xl ${colors.bg} border ${colors.border} flex items-center justify-center relative z-10`}
                      >
                        <step.icon className={`w-7 h-7 ${colors.text}`} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 glass-card rounded-2xl border border-dark-700/50 p-6 md:p-8">
                      <div className="flex items-center gap-3 mb-4">
                        <span
                          className={`text-sm font-bold ${colors.text} bg-dark-900 px-3 py-1 rounded-full`}
                        >
                          Step {step.number}
                        </span>
                        <div className="md:hidden">
                          <step.icon className={`w-5 h-5 ${colors.text}`} />
                        </div>
                      </div>

                      <h3 className="text-2xl font-bold text-gray-900 mb-3">
                        {step.title}
                      </h3>
                      <p className="text-gray-600 mb-4">{step.description}</p>

                      <div
                        className={`p-4 rounded-xl ${colors.bg} border ${colors.border}`}
                      >
                        <div className="flex items-start gap-3">
                          <Zap className={`w-5 h-5 ${colors.text} mt-0.5 flex-shrink-0`} />
                          <span className="text-gray-700 text-sm">{step.example}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Demo Flow */}
      <section className="py-24 bg-dark-900/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl font-bold font-heading text-gray-900 mb-4"
            >
              See It in Action
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-gray-600"
            >
              A real example of how Taskly transforms your day
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Input */}
            <div className="glass-card rounded-2xl border border-dark-700/50 p-6">
              <div className="flex items-center gap-2 text-blue-600 mb-4">
                <MessageSquare className="w-5 h-5" />
                <span className="font-medium">Your Input</span>
              </div>
              <div className="bg-white/50 rounded-xl p-4 border border-dark-700/50">
                <p className="text-gray-700">
                  "Morning meeting with team, finish quarterly report, respond to
                  client emails, workout at lunch, prepare presentation for Friday"
                </p>
              </div>
            </div>

            {/* AI Processing */}
            <div className="glass-card rounded-2xl border border-dark-700/50 p-6">
              <div className="flex items-center gap-2 text-purple-600 mb-4">
                <Brain className="w-5 h-5" />
                <span className="font-medium">AI Analysis</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-gray-600">5 tasks identified</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-gray-600">Cognitive load assessed</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-gray-600">Energy patterns applied</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-gray-600">Optimal times selected</span>
                </div>
              </div>
            </div>

            {/* Output */}
            <div className="glass-card rounded-2xl border border-dark-700/50 p-6">
              <div className="flex items-center gap-2 text-green-400 mb-4">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">Your Schedule</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  <span className="text-gray-600">9:00 - Team Meeting</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-gray-600">10:00 - Quarterly Report</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-gray-600">12:00 - Workout</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-gray-600">2:00 - Client Emails</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                  <span className="text-gray-600">3:30 - Presentation Prep</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl font-bold font-heading text-gray-900 mb-4"
            >
              Frequently Asked Questions
            </motion.h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="glass-card rounded-xl border border-dark-700/50 p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  {faq.question}
                </h3>
                <p className="text-gray-600">{faq.answer}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-dark-900/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold font-heading text-gray-900 mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Be one of the first to plan with Taskly — free during beta.
            </p>
            <Link
              to="/app/auth"
              className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-2xl shadow-blue-500/25"
            >
              Start Free Today
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>
    </LandingLayout>
  );
}
