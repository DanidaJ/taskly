import { Link } from 'react-router-dom';
import { motion, MotionConfig, useReducedMotion } from 'framer-motion';
import {
  Brain,
  Sparkles,
  Timer,
  Moon,
  BarChart3,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { LandingLayout } from '../../components/landing/LandingLayout';
import { HeroPlannerAnimation } from '../../components/landing/HeroPlannerAnimation';
import { usePageMeta } from '../../hooks/usePageMeta';

const highlights = [
  {
    icon: Brain,
    title: 'AI-Powered Planning',
    description: 'Smart scheduling that understands your cognitive patterns',
  },
  {
    icon: Timer,
    title: 'Focus Sessions',
    description: 'Pomodoro timer integrated with your task workflow',
  },
  {
    icon: Moon,
    title: 'Sleep Tracking',
    description: 'Optimize your day based on rest quality',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Insights to continuously improve productivity',
  },
];

const benefits = [
  'Reduce decision fatigue with AI scheduling',
  'Work with your natural energy, not against it',
  'Track progress and celebrate wins',
  'Build sustainable productivity habits',
];

export function Home() {
  usePageMeta(
    'Taskly — Plan Smarter, Not Harder',
    'Taskly is an AI personal planner that builds your day around your natural energy. Type a brain-dump and watch a schedule assemble itself around your peak-focus hours and wind-down time.',
  );
  const shouldReduce = useReducedMotion();

  return (
    <LandingLayout>
      {/* Hero Section */}
      <section className="relative pt-10 sm:pt-12 lg:pt-16 pb-16 lg:pb-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <MotionConfig reducedMotion="user">
            <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-8 lg:gap-16 items-center">
              {/* Left: value proposition */}
              <div className="text-center lg:text-left">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 text-sm font-medium mb-6"
                >
                  <Sparkles className="w-4 h-4" />
                  AI-Powered Productivity
                </motion.div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-[1.08] font-heading">
                  <span className="block overflow-hidden pb-[0.12em]">
                    <motion.span
                      className="block"
                      initial={shouldReduce ? false : { y: '115%' }}
                      animate={{ y: 0 }}
                      transition={{ duration: 0.7, delay: 0.25, ease: [0.2, 0.8, 0.15, 1] }}
                    >
                      Plan Smarter,
                    </motion.span>
                  </span>
                  <span className="block overflow-hidden pb-[0.12em]">
                    <motion.span
                      className="block bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent bg-[length:220%_100%]"
                      initial={shouldReduce ? false : { y: '115%', backgroundPosition: '100% 0' }}
                      animate={{ y: 0, backgroundPosition: '0% 0' }}
                      transition={{
                        y: { duration: 0.7, delay: 0.38, ease: [0.2, 0.8, 0.15, 1] },
                        backgroundPosition: { duration: 1.1, delay: 0.95, ease: [0.4, 0, 0.2, 1] },
                      }}
                    >
                      Not Harder
                    </motion.span>
                  </span>
                </h1>

                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="text-lg sm:text-xl text-gray-600 mb-8 max-w-xl mx-auto lg:mx-0"
                >
                  Taskly uses AI to create personalized schedules that work with your
                  natural energy patterns. Stop fighting your biology — embrace it.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.65 }}
                  className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
                >
                  <Link
                    to="/app/auth"
                    className="group px-7 py-3.5 text-base sm:text-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-apple hover:shadow-glow-blue flex items-center gap-2"
                  >
                    Start Free Today
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <Link
                    to="/how-it-works"
                    className="px-7 py-3.5 text-base sm:text-lg font-semibold text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-xl transition-all bg-white/50 hover:bg-white/80"
                  >
                    See How It Works
                  </Link>
                </motion.div>

                {/* Trust badges */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.8 }}
                  className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-gray-500 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    No credit card required
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Free during beta
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Setup in 2 minutes
                  </div>
                </motion.div>
              </div>

              {/* Right: live AI planner preview */}
              <motion.div
                initial={{ opacity: 0, x: 40, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.95, ease: [0.2, 0.75, 0.2, 1] }}
                className="relative"
              >
                <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-apple-xl">
                  <div className="bg-white/90 backdrop-blur p-4 border-b border-gray-200 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="ml-4 text-sm text-gray-600">Taskly — AI Planner</span>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-3 sm:p-4 lg:p-5">
                    <HeroPlannerAnimation startDelay={900} />
                  </div>
                </div>
              </motion.div>
            </div>
          </MotionConfig>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="py-24 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl sm:text-4xl font-bold font-heading text-gray-900 mb-4"
            >
              Everything You Need to{' '}
              <span className="text-blue-600">Stay Focused</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-gray-600 max-w-2xl mx-auto"
            >
              A complete productivity system designed around how your brain actually works
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {highlights.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group p-6 rounded-2xl glass-card hover:shadow-apple-lg transition-all"
              >
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 w-fit mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              to="/features"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Explore all features
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 font-heading">
                Why Choose{' '}
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Taskly?
                </span>
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Traditional productivity apps force you into rigid systems. Taskly
                adapts to you, learning your patterns and optimizing your schedule
                automatically.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="p-1 rounded-full bg-green-500/20">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-gray-700">{benefit}</span>
                  </motion.li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  to="/app/auth"
                  className="inline-flex items-center gap-2 px-6 py-3 font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-apple"
                >
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl blur-3xl" />
              <div className="relative glass-card">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-blue-500/20 mt-1">
                      <Brain className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 mb-1">
                        "Plan my day for deep work in the morning"
                      </div>
                      <div className="text-sm text-gray-600">
                        AI understands context and preferences
                      </div>
                    </div>
                  </div>
                  <div className="border-l-2 border-blue-500/30 ml-4 pl-8 py-4">
                    <div className="text-sm text-gray-600 mb-2">Generating your plan...</div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm text-gray-700">9:00 AM - Deep Focus: Project Alpha</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        <span className="text-sm text-gray-700">11:00 AM - Break & Stretch</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-sm text-gray-700">11:15 AM - Emails & Admin</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl blur-3xl" />
            <div className="relative glass-card shadow-apple-xl">
              <Sparkles className="w-12 h-12 text-blue-600 mx-auto mb-6" />
              <h2 className="text-3xl sm:text-4xl font-bold font-heading text-gray-900 mb-4">
                Be one of the first.
              </h2>
              <p className="text-lg text-gray-600 mb-8 max-w-xl mx-auto">
                Taskly is built by one person who needed it to exist. Join early,
                help shape where it goes — free during beta, no credit card required.
              </p>
              <Link
                to="/app/auth"
                className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-apple hover:shadow-glow-blue"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </LandingLayout>
  );
}
