import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Brain,
  Menu,
  X,
  Sparkles,
  Instagram,
  Linkedin,
  Globe,
} from 'lucide-react';
import { useState } from 'react';

const navLinks = [
  { name: 'Home', href: '/' },
  { name: 'Features', href: '/features' },
  { name: 'How It Works', href: '/how-it-works' },
  { name: 'About', href: '/about' },
];

interface LandingLayoutProps {
  children: React.ReactNode;
}

export function LandingLayout({ children }: LandingLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* Navigation - Apple Glass Style */}
      <nav className="sticky top-4 z-50 mx-4 sm:mx-6 lg:mx-8">
        <div className="max-w-7xl mx-auto glass-card rounded-apple-lg shadow-apple !p-2">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 shadow-sm group-hover:shadow-glow-blue transition-shadow">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text-blue font-heading">
                Taskly
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  className={`text-sm font-medium transition-colors relative ${location.pathname === link.href
                      ? 'text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  {link.name}
                  {location.pathname === link.href && (
                    <motion.div
                      layoutId="navIndicator"
                      className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                    />
                  )}
                </Link>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                to="/app/auth"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/app/auth"
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-apple hover:from-blue-600 hover:to-blue-700 transition-all shadow-apple hover:shadow-glow-blue"
              >
                Get Started Free
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="md:hidden mt-2 glass-card rounded-apple-lg shadow-apple"
          >
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === link.href
                      ? 'bg-blue-500/10 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  {link.name}
                </Link>
              ))}
              <div className="pt-4 border-t border-gray-200 space-y-2">
                <Link
                  to="/app/auth"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2 text-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/app/auth"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2 text-center text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700"
                >
                  Get Started Free
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Main Content */}
      <main className="relative z-10">{children}</main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-200 bg-white/50 backdrop-blur-xl mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Top Row - Brand, Nav Links, Social */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-8">
            {/* Brand */}
            <Link to="/" className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900 font-heading">Taskly</span>
            </Link>

            {/* Navigation Links - Horizontal */}
            <nav className="flex items-center gap-8">
              <Link to="/features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Features
              </Link>
              <Link to="/how-it-works" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                How It Works
              </Link>
              <Link to="/about" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                About
              </Link>
              <Link to="/app/auth" className="text-sm text-blue-600 hover:text-blue-700 transition-colors font-medium">
                Get Started
              </Link>
            </nav>

            {/* Social Links */}
            <div className="flex items-center gap-4">
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-blue-600 transition-colors"
                title="Portfolio"
              >
                <Globe className="w-5 h-5" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-pink-600 transition-colors"
                title="Instagram"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-blue-600 transition-colors"
                title="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Bottom Row - Copyright Centered */}
          <div className="pt-8 border-t border-gray-200 flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-gray-600">
              © 2025 <span className="gradient-text-blue font-medium">Nerdtastic🧠™</span> by Danida Jayakody
            </p>
            <p className="text-xs text-gray-500">
              Taskly is a project by Nerdtastic🧠™ | All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
