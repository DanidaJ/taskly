import { motion } from 'framer-motion';
import {
  Heart,
  Sparkles,
  Target,
  Lightbulb,
  Code2,
  Rocket,
  ArrowRight,
  Globe,
  Instagram,
  Linkedin,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingLayout } from '../../components/landing/LandingLayout';
import { usePageMeta } from '../../hooks/usePageMeta';

const values = [
  {
    icon: Target,
    title: 'Purpose-Driven',
    description:
      'Every feature is designed with intention - to help you achieve more while stressing less.',
  },
  {
    icon: Lightbulb,
    title: 'Human-Centered',
    description:
      'AI that adapts to you, not the other way around. Your natural rhythm matters.',
  },
  {
    icon: Heart,
    title: 'Built with Care',
    description:
      'Crafted with attention to detail and a genuine desire to make productivity enjoyable.',
  },
  {
    icon: Code2,
    title: 'Modern Tech',
    description:
      'Powered by cutting-edge AI and built with the latest web technologies.',
  },
];

const timeline = [
  {
    phase: 'The Problem',
    title: 'Productivity Burnout',
    description:
      'Traditional to-do apps force rigid schedules that ignore how we actually work. The result? Stress, guilt, and abandoned tasks.',
  },
  {
    phase: 'The Insight',
    title: 'Energy Matters',
    description:
      'Research shows our cognitive abilities fluctuate throughout the day. What if our tools worked WITH this, not against it?',
  },
  {
    phase: 'The Solution',
    title: 'Taskly is Born',
    description:
      'An AI-powered planner that understands task complexity, learns your patterns, and creates schedules that feel natural.',
  },
  {
    phase: 'The Vision',
    title: 'Sustainable Productivity',
    description:
      'Not just getting more done, but feeling better while doing it. Work smarter, not harder.',
  },
];

const techStack = [
  { name: 'React', category: 'Frontend' },
  { name: 'TypeScript', category: 'Language' },
  { name: 'Tailwind CSS', category: 'Styling' },
  { name: 'FastAPI', category: 'Backend' },
  { name: 'Mistral AI', category: 'AI Engine' },
  { name: 'Supabase', category: 'Database' },
  { name: 'Framer Motion', category: 'Animations' },
  { name: 'Zustand', category: 'State' },
];

export function About() {
  usePageMeta(
    'About — Taskly',
    'Why Taskly exists: a personal planner that respects your biology, helping you work with your natural energy instead of fighting it.',
  );
  return (
    <LandingLayout>
      {/* Hero */}
      <section className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium mb-6"
            >
              <Heart className="w-4 h-4" />
              The Story Behind Taskly
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6 font-heading"
            >
              Built by{' '}
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-purple-400 bg-clip-text text-transparent">
                one person
              </span>
              , for the way you actually work
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-gray-600"
            >
              Taskly is an independent project — designed, built, and tested end
              to end by a single developer who wanted a planner that respects how
              people really think and work.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Creator Section */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-apple-lg p-8 md:p-12 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl" />

            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Avatar/Brand */}
              <div className="text-center md:text-left">
                <img
                  src="/profile.jpeg"
                  alt="Danida Jayakody, creator of Taskly"
                  className="w-36 h-36 rounded-3xl object-cover object-top border border-white/60 shadow-apple-lg mb-6 mx-auto md:mx-0"
                />
                <p className="text-2xl font-bold text-gray-900 mb-1">
                  Danida Jayakody
                </p>
                <p className="text-gray-600 mb-6">
                  Solo developer &amp; designer of Taskly
                </p>
                
                {/* Social Links */}
                <div className="flex items-center justify-center md:justify-start gap-4">
                  <a
                    href="https://danidajay.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl bg-gray-100 text-gray-600 hover:text-blue-600 hover:bg-gray-200 transition-all"
                    title="Portfolio"
                  >
                    <Globe className="w-5 h-5" />
                  </a>
                  <a
                    href="https://www.instagram.com/danida_j/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl bg-gray-100 text-gray-600 hover:text-pink-600 hover:bg-gray-200 transition-all"
                    title="Instagram"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                  <a
                    href="https://www.linkedin.com/in/danida-jayakody-52a884200/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl bg-gray-100 text-gray-600 hover:text-blue-600 hover:bg-gray-200 transition-all"
                    title="LinkedIn"
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                </div>
              </div>

              {/* Bio */}
              <div>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Taskly started as a tool I built for myself. Like a lot of
                  people, I'd tried planner after planner and kept hitting the same
                  wall — they treated every task and every hour as the same,
                  ignoring that a tired afternoon is nothing like a focused morning.
                </p>
                <p className="text-gray-600 leading-relaxed mb-4">
                  So I built the planner I wished existed. Every part of Taskly —
                  the design, the code, the AI, the testing, the late-night bug
                  fixes — is the work of one person. There's no team and no
                  investors behind it; just someone who genuinely cares whether it
                  works for you.
                </p>
                <p className="text-gray-600 leading-relaxed">
                  It's early, and it's growing one honest step at a time. If Taskly
                  makes even one of your days feel a little more human, it's done
                  its job.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 bg-dark-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl font-bold font-heading text-gray-900 mb-4"
            >
              What Drives Us
            </motion.h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-2xl glass-card border border-dark-700/50 text-center"
              >
                <div className="p-3 rounded-xl bg-blue-500/10 w-fit mx-auto mb-4">
                  <value.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {value.title}
                </h3>
                <p className="text-gray-600 text-sm">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Journey Timeline */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl font-bold font-heading text-gray-900 mb-4"
            >
              The Journey
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-gray-600"
            >
              From frustration to innovation
            </motion.p>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-purple-500" />

            <div className="space-y-12">
              {timeline.map((item, index) => (
                <motion.div
                  key={item.phase}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className={`relative flex items-center gap-8 ${
                    index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                  }`}
                >
                  {/* Dot */}
                  <div className="absolute left-4 md:left-1/2 w-3 h-3 rounded-full bg-blue-500 transform -translate-x-1/2 ring-4 ring-dark-900" />

                  {/* Content */}
                  <div className={`ml-12 md:ml-0 md:w-1/2 ${index % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12'}`}>
                    <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                      {item.phase}
                    </span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                      {item.title}
                    </h3>
                    <p className="text-gray-600">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-16 bg-dark-900/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl font-bold font-heading text-gray-900 mb-4"
            >
              Built With
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-gray-600"
            >
              Modern technologies for a modern productivity experience
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-3"
          >
            {techStack.map((tech) => (
              <div
                key={tech.name}
                className="px-4 py-2 rounded-full bg-white/50 border border-dark-700/50 hover:border-blue-500/30 transition-colors"
              >
                <span className="text-gray-900 font-medium">{tech.name}</span>
                <span className="text-gray-600 text-sm ml-2">{tech.category}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur-3xl" />
            <div className="relative bg-gradient-to-br from-dark-800/80 to-dark-900/80 rounded-3xl border border-dark-700/50 p-12">
              <Rocket className="w-12 h-12 text-blue-600 mx-auto mb-6" />
              <h2 className="text-3xl font-bold text-gray-900 mb-4 font-heading">
                Ready to Try Taskly?
              </h2>
              <p className="text-lg text-gray-600 mb-8 max-w-xl mx-auto">
                Experience AI-powered productivity that actually understands how
                you work. Start for free, no credit card required.
              </p>
              <Link
                to="/app/auth"
                className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-2xl shadow-blue-500/25 hover:shadow-blue-500/40"
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
