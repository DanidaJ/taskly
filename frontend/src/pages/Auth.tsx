import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Mail, Lock, User, ArrowRight, MailCheck, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { Button, Input } from '@/components/ui';
import toast from 'react-hot-toast';

const MIN_PASSWORD_LENGTH = 8;

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [view, setView] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // Email a verification link was sent to (drives the "check your inbox" screen).
  const [pendingEmail, setPendingEmail] = useState('');

  const { signIn, signUp, resendConfirmation, isAuthenticated } = useAuthStore();

  // If a session becomes active while on this page — notably after clicking an
  // email-confirmation link that lands on /app and gets bounced here before the
  // session is detected — forward into the app.
  useEffect(() => {
    if (isAuthenticated) window.location.href = '/app';
  }, [isAuthenticated]);

  const isUnconfirmedError = (error: any): boolean =>
    error?.code === 'email_not_confirmed' ||
    /not confirmed|confirm your email/i.test(error?.message || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD_LENGTH) {
        toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirmPassword) {
        toast.error('Passwords do not match.');
        return;
      }
    }

    setIsLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        toast.success('Welcome back!');
        // Full reload so the persisted session is in place before the app boots.
        window.location.href = '/app';
        return;
      }

      const { needsEmailConfirmation, alreadyRegistered } = await signUp(
        email,
        password,
        fullName,
      );

      if (alreadyRegistered) {
        toast.error('This email is already registered. Please sign in.');
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
        setIsLoading(false);
        return;
      }

      if (needsEmailConfirmation) {
        setPendingEmail(email);
        setView('verify');
        setIsLoading(false);
        return;
      }

      // Confirmation disabled → signed in immediately.
      toast.success('Account created!');
      window.location.href = '/app';
    } catch (error: any) {
      if (mode === 'signin' && isUnconfirmedError(error)) {
        // The account exists but hasn't verified yet — send them to the
        // verify screen so they can resend, instead of a dead-end error.
        setPendingEmail(email);
        setView('verify');
        toast('Please verify your email to continue.', { icon: '✉️' });
      } else {
        toast.error(error.message || 'Authentication failed');
      }
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setResending(true);
    try {
      await resendConfirmation(pendingEmail);
      toast.success('Verification email sent. Check your inbox and spam.');
    } catch (error: any) {
      toast.error(error.message || 'Could not resend email. Try again shortly.');
    } finally {
      setResending(false);
    }
  };

  const backToSignIn = () => {
    setView('form');
    setMode('signin');
    setPassword('');
    setConfirmPassword('');
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-apple-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
            <span className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Taskly</span>
          </div>
          <p className="text-gray-600">
            AI-powered personal planner for peak productivity
          </p>
        </div>

        {/* Card */}
        <div className="glass-card">
          {view === 'verify' ? (
            /* -------------------- Verify email screen -------------------- */
            <div className="text-center py-4">
              <div className="inline-flex p-4 rounded-full bg-blue-50 mb-5">
                <MailCheck className="w-9 h-9 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Verify your email</h2>
              <p className="text-gray-600 mb-1">
                We sent a confirmation link to
              </p>
              <p className="font-medium text-gray-900 mb-5 break-all">{pendingEmail}</p>
              <p className="text-sm text-gray-500 mb-6">
                Click the link in that email to activate your account. Check your spam
                folder if it doesn't arrive within a minute.
              </p>

              <Button
                variant="primary"
                className="w-full mb-3"
                onClick={handleResend}
                isLoading={resending}
              >
                Resend email
              </Button>
              <button
                onClick={backToSignIn}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </button>
            </div>
          ) : (
            /* -------------------- Sign in / Sign up form -------------------- */
            <>
              <div className="flex mb-6 bg-gray-100 rounded-apple p-1">
                <button
                  onClick={() => setMode('signin')}
                  className={`flex-1 py-2 rounded-apple text-sm font-medium transition-all ${
                    mode === 'signin' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setMode('signup')}
                  className={`flex-1 py-2 rounded-apple text-sm font-medium transition-all ${
                    mode === 'signup' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <AnimatePresence mode="wait">
                  {mode === 'signup' && (
                    <motion.div
                      key="fullname"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <Input
                        label="Full Name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Doe"
                        leftIcon={<User className="w-4 h-4" />}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  leftIcon={<Lock className="w-4 h-4" />}
                  required
                  helperText={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
                />

                <AnimatePresence mode="wait">
                  {mode === 'signup' && (
                    <motion.div
                      key="confirm-password"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <Input
                        label="Confirm Password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        leftIcon={<Lock className="w-4 h-4" />}
                        required
                        error={
                          confirmPassword.length > 0 && confirmPassword !== password
                            ? 'Passwords do not match'
                            : undefined
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  isLoading={isLoading}
                  rightIcon={!isLoading && <ArrowRight className="w-4 h-4" />}
                >
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </motion.div>
    </div>
  );
}
