import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { useUserPatternsStore } from '@/stores/userPatternsStore';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Tasks from '@/pages/Tasks';
import Planner from '@/pages/Planner';
import Schedule from '@/pages/Schedule';
import Reflection from '@/pages/Reflection';
import Settings from '@/pages/Settings';
import Auth from '@/pages/Auth';
import FocusTimer from '@/pages/FocusTimer';
import SleepTracker from '@/pages/SleepTracker';
import Analytics from '@/pages/Analytics';
import { Home, Features, HowItWorks, About } from '@/pages/landing';
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  ensureFcmTokenRegistered,
  onForegroundMessage,
} from '@/services/firebase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="animate-pulse-soft">
          <div className="w-12 h-12 rounded-full bg-primary-500" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !user) {
    return <Navigate to="/app/auth" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { initialize, isAuthenticated, user } = useAuthStore();
  const { loadAllProfile } = useUserProfileStore();
  const { loadPatterns, reset: resetPatterns } = useUserPatternsStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Load profile + patterns when authenticated (non-blocking).
  // Wipe them on sign-out so the next user starts with a clean slate.
  useEffect(() => {
    if (isAuthenticated && user) {
      loadAllProfile().catch(error => {
        console.log('Profile load skipped:', error.message || 'No profile data available');
      });
      loadPatterns().catch(error => {
        console.log('Patterns load skipped:', error.message || 'No patterns available');
      });
    } else {
      resetPatterns();
    }
  }, [isAuthenticated, user, loadAllProfile, loadPatterns, resetPatterns]);

  // Push notifications: register token (if already permitted) + listen for
  // foreground messages while a tab is open. Permission itself is requested
  // from the Settings page so users explicitly opt in.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const { session } = useAuthStore.getState();
        await ensureFcmTokenRegistered(session?.access_token);
        unsub = onForegroundMessage((payload) => {
          const title = payload.notification?.title || 'Taskly';
          const body = payload.notification?.body || '';
          toast(`${title}\n${body}`, { duration: 6000 });
        });
      } catch (e) {
        console.log('FCM init skipped:', e);
      }
    })();
    return () => { try { unsub?.(); } catch { /* noop */ } };
  }, [isAuthenticated, user]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Pages */}
        <Route path="/" element={<Home />} />
        <Route path="/features" element={<Features />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/about" element={<About />} />

        {/* App Routes */}
        <Route path="/app/auth" element={<Auth />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="planner" element={<Planner />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="focus" element={<FocusTimer />} />
          <Route path="sleep" element={<SleepTracker />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="reflection" element={<Reflection />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
