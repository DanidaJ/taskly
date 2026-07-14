import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Sparkles,
  Calendar,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  X,
  Brain,
  Moon,
  BarChart3,
  Plus,
  Inbox,
  HelpCircle,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useTaskStore } from '@/stores';
import { clsx } from 'clsx';
import QuickCapture from './QuickCapture';
import MiniFocusCountdown from './MiniFocusCountdown';
import GlobalTimerCompletionPrompt from './GlobalTimerCompletionPrompt';
import OnboardingGate from './onboarding/OnboardingGate';

const navigation = [
  { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
  { name: 'AI Planner', href: '/app/planner', icon: Sparkles },
  { name: 'Backlog', href: '/app/backlog', icon: Inbox },
  { name: 'Schedule', href: '/app/schedule', icon: Calendar },
  { name: 'Focus Timer', href: '/app/focus', icon: Brain },
  { name: 'Sleep', href: '/app/sleep', icon: Moon },
  { name: 'Analytics', href: '/app/analytics', icon: BarChart3 },
  { name: 'Reflection', href: '/app/reflection', icon: BookOpen },
  { name: 'Settings', href: '/app/settings', icon: Settings },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const { user, signOut } = useAuthStore();
  const location = useLocation();
  const checkMissedTasks = useTaskStore((state) => state.checkMissedTasks);

  // Keyboard shortcut for quick capture
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setQuickCaptureOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Globally enforce missed-task status everywhere in the app shell.
  // Without this, a task whose scheduled window has passed could still be
  // started from Dashboard/Focus until the user happens to open Schedule.
  useEffect(() => {
    checkMissedTasks();
    const interval = setInterval(checkMissedTasks, 60000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkMissedTasks();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkMissedTasks]);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Apple Glass Style */}
      <aside
        className={clsx(
          'fixed top-3 left-3 bottom-3 z-50 w-64 bg-white/80 backdrop-blur-2xl border border-white/50 rounded-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] transform transition-transform duration-300 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-13 px-4 border-b border-gray-200/50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <span className="text-base font-bold gradient-text-blue">Taskly</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-lg lg:hidden hover:bg-gray-100/80 transition-colors"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={clsx(
                    'nav-item',
                    isActive && 'active'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </NavLink>
              );
            })}
          </nav>

          {/* Help / How it works — opens the guide in a new tab so the app
              session and any running timer aren't disrupted. */}
          <div className="px-2 pb-1">
            <a
              href="/how-it-works"
              target="_blank"
              rel="noreferrer"
              className="nav-item"
            >
              <HelpCircle className="w-5 h-5" />
              Help &amp; Guide
            </a>
          </div>

          {/* User section */}
          <div className="p-3 border-t border-gray-200/50">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <span className="text-sm font-medium text-white">
                  {user?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.full_name || 'User'}
                </p>
                <p className="text-xs text-gray-600 truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-[272px]">
        {/* Mobile header - Glass Style */}
        <header className="sticky top-3 z-30 mx-3 mb-4 lg:hidden">
          <div className="bg-white/80 backdrop-blur-2xl border border-white/50 rounded-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] px-4 h-13 flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100/80 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
            <div className="flex items-center gap-2 ml-4">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <span className="text-lg font-bold gradient-text-blue">Taskly</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Floating Add Task Button - Apple Style */}
        <button
          onClick={() => setQuickCaptureOpen(true)}
          className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-apple-lg hover:shadow-glow-blue hover:scale-105 active:scale-95 transition-all flex items-center justify-center z-40"
          title="Add Task (⌘K)"
        >
          <Plus className="w-6 h-6" />
        </button>

        <MiniFocusCountdown />
      </div>

      {/* Quick Capture Modal */}
      <QuickCapture
        isOpen={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
      />

      {/* App-global timer completion prompt: surfaces the mandatory yes/no
          on every page so the user can't dodge it by leaving FocusTimer. */}
      <GlobalTimerCompletionPrompt />

      {/* First-run setup wizard — shows once for users who haven't onboarded. */}
      <OnboardingGate />
    </div>
  );
}
