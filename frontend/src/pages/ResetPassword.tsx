import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input } from '@/components/ui';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useAuthStore } from '@/stores';
import { supabase } from '@/services/supabase';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Landing page for Supabase password-recovery links. Supabase parses the
 * recovery token out of the URL and establishes a temporary session, after
 * which updateUser({ password }) is allowed. If we never get that session the
 * link was invalid or already used — say so rather than showing a form that
 * cannot possibly work.
 */
export default function ResetPassword() {
  usePageMeta('Reset Password — Taskly');
  const navigate = useNavigate();
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    // The session may not exist on first paint — supabase-js parses the URL hash
    // asynchronously and then emits PASSWORD_RECOVERY / SIGNED_IN.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        setHasRecoverySession(true);
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) setHasRecoverySession(true);
      setChecking(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await updatePassword(password);
      setDone(true);
      toast.success('Password updated. You can sign in now.');
      setTimeout(() => navigate('/app/auth'), 1500);
    } catch (error: any) {
      toast.error(error?.message || 'Could not update your password. Try the link again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-blue-50 to-white">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-blue-500/10">
            <KeyRound className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Set a new password</h1>
            <p className="text-sm text-gray-600">Choose a password you don't use elsewhere.</p>
          </div>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking your reset link…
          </div>
        ) : done ? (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm text-green-900">
              Password updated. Taking you to sign in…
            </p>
          </div>
        ) : !hasRecoverySession ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">
                This reset link is invalid or has already been used. Request a new one from the
                sign-in page.
              </p>
            </div>
            <Button variant="secondary" className="w-full" onClick={() => navigate('/app/auth')}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">New password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                autoComplete="new-password"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Confirm new password
              </label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                disabled={saving}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={saving || !password || !confirm}
              leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {saving ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
