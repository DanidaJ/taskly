import { motion } from 'framer-motion';
import {
  Brain,
  Timer,
  Moon,
  BarChart3,
  Zap,
  Calendar,
  MessageSquare,
  Bell,
  Target,
  Lightbulb,
  RefreshCw,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingLayout } from '../../components/landing/LandingLayout';

const mainFeatures = [
  {
    icon: Brain,
    title: 'AI-Powered Planning',
    description:
      'Our AI understands your task descriptions and automatically schedules them based on cognitive load, deadlines, and your energy patterns.',
    color: 'primary',
    details: [
      'Natural language task input',
      'Automatic task categorization',
      'Energy-aware scheduling',
      'Smart time blocking',
    ],
  },
  {
    icon: Timer,
    title: 'Focus Timer',
    description:
      'Built-in Pomodoro timer with customizable work and break intervals. Track focused time and integrate with your tasks.',
    color: 'accent',
    details: [
      '25/5 Pomodoro technique',
      'Custom interval settings',
      'Session tracking & stats',
      'Task integration',
    ],
  },
  {
    icon: Moon,
    title: 'Sleep Tracking',
    description:
      'Log your sleep quality to help the AI understand your energy levels and create better schedules.',
    color: 'purple',
    details: [
      'Sleep quality logging',
      'Energy correlation',
      'Optimal scheduling times',
      'Rest recommendations',
    ],
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description:
      'Comprehensive insights into your productivity patterns. Track focus time, task completion, and identify areas for improvement.',
    color: 'green',
    details: [
      'Weekly productivity trends',
      'Focus time tracking',
      'Task completion rates',
      'Pattern recognition',
    ],
  },
];

const additionalFeatures = [
  {
    icon: Calendar,
    title: 'Smart Schedule',
    description: 'Visual calendar with drag-and-drop, auto-adjusting blocks',
  },
  {
    icon: MessageSquare,
    title: 'Daily Reflection',
    description: 'End-of-day prompts to review and improve habits',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Contextual reminders that respect your focus time',
  },
  {
    icon: Target,
    title: 'Goal Setting',
    description: 'Set and track daily, weekly, and monthly objectives',
  },
  {
    icon: Lightbulb,
    title: 'Morning Briefing',
    description: 'AI-generated daily overview and priorities',
  },
  {
    icon: RefreshCw,
    title: 'Quick Capture',
    description: 'Instantly add tasks from anywhere in the app',
  },
];

const colorClasses = {
  primary: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-600',
    border: 'border-blue-500/30',
    gradient: 'from-blue-500 to-blue-600',
  },
  accent: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-600',
    border: 'border-purple-500/30',
    gradient: 'from-purple-500 to-purple-600',
  },
  purple: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    gradient: 'from-purple-500 to-purple-600',
  },
  green: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    gradient: 'from-green-500 to-green-600',
  },
};

export function Features() {
  return (
    <LandingLayout>
      {/* Header */}
      <section className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 text-sm font-medium mb-6"
          >
            <Zap className="w-4 h-4" />
            Powerful Features
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl font-bold font-heading text-gray-900 mb-6"
          >
            Everything You Need for{' '}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Peak Productivity
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-600 max-w-2xl mx-auto"
          >
            A comprehensive suite of tools designed to help you work smarter, stay
            focused, and achieve more every day.
          </motion.p>
        </div>
      </section>

      {/* Main Features */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-24">
            {mainFeatures.map((feature, index) => {
              const colors = colorClasses[feature.color as keyof typeof colorClasses];
              const isEven = index % 2 === 0;

              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 }}
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                    isEven ? '' : 'lg:flex-row-reverse'
                  }`}
                >
                  <div className={isEven ? '' : 'lg:order-2'}>
                    <div
                      className={`inline-flex p-3 rounded-2xl ${colors.bg} mb-6`}
                    >
                      <feature.icon className={`w-8 h-8 ${colors.text}`} />
                    </div>
                    <h2 className="text-3xl font-bold font-heading text-gray-900 mb-4">
                      {feature.title}
                    </h2>
                    <p className="text-lg text-gray-600 mb-6">
                      {feature.description}
                    </p>
                    <ul className="space-y-3">
                      {feature.details.map((detail) => (
                        <li key={detail} className="flex items-center gap-3">
                          <div className={`p-1 rounded-full ${colors.bg}`}>
                            <Zap className={`w-3 h-3 ${colors.text}`} />
                          </div>
                          <span className="text-gray-700">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={isEven ? '' : 'lg:order-1'}>
                    <div className="relative">
                      <div
                        className={`absolute inset-0 bg-gradient-to-r ${colors.gradient} opacity-10 rounded-3xl blur-3xl`}
                      />
                      <div
                        className={`relative glass-card rounded-2xl border ${colors.border} p-8 backdrop-blur-sm`}
                      >
                        {/* Feature visualization */}
                        {index === 0 && (
                          <div className="space-y-4">
                            <div className="bg-white/50 rounded-lg p-4 border border-dark-700/50">
                              <div className="text-sm text-gray-600 mb-2">Your input:</div>
                              <div className="text-gray-900">"Finish report, 3 meetings, gym at 6"</div>
                            </div>
                            <div className="flex items-center gap-2 text-blue-600">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span className="text-sm">AI processing...</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-3 bg-white/50 rounded-lg p-3">
                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                <span className="text-sm text-gray-700">9 AM - Finish report (Deep Focus)</span>
                              </div>
                              <div className="flex items-center gap-3 bg-white/50 rounded-lg p-3">
                                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                <span className="text-sm text-gray-700">11 AM - Meeting 1 (Light Focus)</span>
                              </div>
                              <div className="flex items-center gap-3 bg-white/50 rounded-lg p-3">
                                <div className="w-3 h-3 rounded-full bg-green-400" />
                                <span className="text-sm text-gray-700">6 PM - Gym (Physical)</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {index === 1 && (
                          <div className="text-center py-8">
                            <div className="text-6xl font-bold text-gray-900 mb-2">25:00</div>
                            <div className="text-purple-600 font-medium mb-6">Focus Session</div>
                            <div className="flex items-center justify-center gap-4">
                              <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center">
                                <Timer className="w-8 h-8 text-purple-600" />
                              </div>
                            </div>
                            <div className="mt-6 flex items-center justify-center gap-2">
                              {[1, 2, 3, 4].map((i) => (
                                <div
                                  key={i}
                                  className={`w-3 h-3 rounded-full ${
                                    i <= 2 ? 'bg-purple-600' : 'bg-dark-700'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="text-sm text-gray-600 mt-2">2/4 sessions completed</div>
                          </div>
                        )}
                        {index === 2 && (
                          <div className="space-y-4">
                            <div className="text-center mb-6">
                              <Moon className="w-12 h-12 text-purple-400 mx-auto mb-2" />
                              <div className="text-gray-900 font-medium">Last Night's Sleep</div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-white/50 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-gray-900">7.5h</div>
                                <div className="text-sm text-gray-600">Duration</div>
                              </div>
                              <div className="bg-white/50 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-purple-400">85%</div>
                                <div className="text-sm text-gray-600">Quality</div>
                              </div>
                            </div>
                            <div className="bg-white/50 rounded-lg p-4">
                              <div className="text-sm text-gray-600 mb-2">Recommendation:</div>
                              <div className="text-sm text-gray-700">Great sleep! Schedule deep work for morning peak hours.</div>
                            </div>
                          </div>
                        )}
                        {index === 3 && (
                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <div className="text-gray-900 font-medium">Weekly Overview</div>
                              <div className="text-sm text-gray-600">This Week</div>
                            </div>
                            <div className="flex items-end justify-between h-32 mb-4">
                              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                                <div key={day + i} className="flex flex-col items-center gap-2">
                                  <div
                                    className="w-8 rounded-t bg-gradient-to-t from-green-500 to-green-400"
                                    style={{ height: `${[60, 80, 70, 90, 75, 40, 30][i]}%` }}
                                  />
                                  <span className="text-xs text-gray-600">{day}</span>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-white/50 rounded-lg p-3">
                                <div className="text-lg font-bold text-green-400">23.5h</div>
                                <div className="text-xs text-gray-600">Focus Time</div>
                              </div>
                              <div className="bg-white/50 rounded-lg p-3">
                                <div className="text-lg font-bold text-gray-900">87%</div>
                                <div className="text-xs text-gray-600">Completion</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Additional Features Grid */}
      <section className="py-24 bg-dark-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl font-bold font-heading text-gray-900 mb-4"
            >
              And Much More
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-gray-600"
            >
              Additional tools to supercharge your productivity
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {additionalFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="p-6 rounded-2xl glass-card border border-dark-700/50 hover:border-blue-500/30 transition-colors group"
              >
                <div className="p-3 rounded-xl bg-blue-500/10 w-fit mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center glass-card rounded-3xl border border-dark-700/50 p-12"
          >
            <div className="p-4 rounded-2xl bg-green-500/10 w-fit mx-auto mb-6">
              <Shield className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold font-heading text-gray-900 mb-4">
              Your Data is Safe
            </h2>
            <p className="text-gray-600 mb-8 max-w-xl mx-auto">
              We take security seriously. Your data is encrypted at rest and in
              transit. We never sell your information to third parties.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                End-to-end encryption
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                GDPR compliant
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                Regular security audits
              </div>
            </div>
          </motion.div>
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
              Ready to Experience These Features?
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Start your free trial today and transform how you work.
            </p>
            <Link
              to="/app/auth"
              className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-2xl shadow-blue-500/25"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>
    </LandingLayout>
  );
}
