import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { onboardingService } from '@/services/api';
import OnboardingWizard from './OnboardingWizard';

/**
 * Checks once per session whether the signed-in user has completed the first-run
 * setup wizard, and shows it if not. Fails open: if the status check errors we
 * never show the wizard, so a backend hiccup can't trap the user behind it.
 */
export default function OnboardingGate() {
  const { isAuthenticated, user } = useAuthStore();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const { has_onboarded } = await onboardingService.getStatus();
        if (!cancelled && !has_onboarded) setShow(true);
      } catch {
        // Fail open — don't block the app if we can't read the flag.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user]);

  if (!show) return null;
  return <OnboardingWizard onDone={() => setShow(false)} />;
}
