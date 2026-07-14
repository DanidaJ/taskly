import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Zap,
  Moon,
  Sun,
  Gauge,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { EnergyPreference } from '@/types';
import { profileService, onboardingService } from '@/services/api';
import { useUserProfileStore, defaultPreferences, defaultEnergyProfile } from '@/stores/userProfileStore';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

interface OnboardingWizardProps {
  /** Called once the wizard has been completed or skipped (flag already persisted). */
  onDone: () => void;
}

// Peak-focus window suggested for each chronotype. Users can fine-tune on the
// next step; these just save them from typing when the default fits.
const PEAK_DEFAULTS: Record<EnergyPreference, { start: string; end: string }> = {
  morning: { start: '09:00', end: '12:00' },
  afternoon: { start: '13:00', end: '16:00' },
  evening: { start: '18:00', end: '21:00' },
  night: { start: '21:00', end: '23:30' },
};

const ENERGY_OPTIONS: { value: EnergyPreference; label: string; description: string }[] = [
  { value: 'morning', label: 'Morning person', description: 'Sharpest 6am – 12pm' },
  { value: 'afternoon', label: 'Afternoon peak', description: 'Sharpest 12pm – 6pm' },
  { value: 'evening', label: 'Evening worker', description: 'Sharpest 6pm – 10pm' },
  { value: 'night', label: 'Night owl', description: 'Sharpest after 10pm' },
];

// welcome -> energy -> peak -> sleep -> workload
const TOTAL_STEPS = 5;

export default function OnboardingWizard({ onDone }: OnboardingWizardProps) {
  const { setEnergyProfile, setSleepSchedule, setPreferences } = useUserProfileStore();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Collected answers
  const [preference, setPreference] = useState<EnergyPreference>('morning');
  const [peakStart, setPeakStart] = useState(PEAK_DEFAULTS.morning.start);
  const [peakEnd, setPeakEnd] = useState(PEAK_DEFAULTS.morning.end);
  const [wakeTime, setWakeTime] = useState('07:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [maxHours, setMaxHours] = useState(8);

  const choosePreference = (value: EnergyPreference) => {
    setPreference(value);
    // Re-seed the peak window to match the chosen chronotype.
    setPeakStart(PEAK_DEFAULTS[value].start);
    setPeakEnd(PEAK_DEFAULTS[value].end);
  };

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const persist = async () => {
    setSaving(true);
    // Save the three profile pieces independently so one failure doesn't sink
    // the others, then always record completion so the user is never re-trapped.
    const [energyRes, sleepRes, prefsRes] = await Promise.allSettled([
      profileService.saveEnergyProfile({
        preference,
        peak_focus_start: peakStart,
        peak_focus_end: peakEnd,
        fatigue_points: defaultEnergyProfile.fatigue_points,
      }),
      profileService.saveSleepSchedule({
        wake_time: wakeTime,
        sleep_time: sleepTime,
        wind_down_minutes: 30,
        preferred_end_time: null,
      }),
      profileService.savePreferences({
        ...defaultPreferences,
        max_daily_workload_hours: maxHours,
      }),
    ]);

    if (energyRes.status === 'fulfilled') setEnergyProfile(energyRes.value);
    if (sleepRes.status === 'fulfilled') setSleepSchedule(sleepRes.value);
    if (prefsRes.status === 'fulfilled') setPreferences(prefsRes.value);

    const anyFailed = [energyRes, sleepRes, prefsRes].some((r) => r.status === 'rejected');

    try {
      // Capture the browser timezone so missed-detection, reminders, and
      // rescheduling resolve times in the user's zone rather than UTC.
      await onboardingService.complete(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      // Non-fatal: worst case the wizard shows again next login.
    }

    setSaving(false);
    if (anyFailed) {
      toast('Saved what we could — you can adjust the rest in Settings.', { icon: '⚠️' });
    } else {
      toast.success("You're all set! Your plans are now tuned to you.");
    }
    onDone();
  };

  const skip = async () => {
    setSaving(true);
    try {
      await onboardingService.complete(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* non-fatal */
    }
    setSaving(false);
    onDone();
  };

  const stepMeta = [
    { icon: Sparkles, accent: 'text-blue-600' },
    { icon: Zap, accent: 'text-amber-500' },
    { icon: Zap, accent: 'text-amber-500' },
    { icon: Moon, accent: 'text-indigo-500' },
    { icon: Gauge, accent: 'text-green-600' },
  ][step];
  const StepIcon = stepMeta.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-lg bg-white rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.25)] overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
            initial={false}
            animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-2xl bg-gray-50">
              <StepIcon className={clsx('w-6 h-6', stepMeta.accent)} />
            </div>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {step === 0 ? 'Welcome' : `Step ${step} of ${TOTAL_STEPS - 1}`}
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step 0 — Welcome */}
              {step === 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">
                    Welcome to Taskly 👋
                  </h2>
                  <p className="text-gray-600 leading-relaxed">
                    Taskly plans your day around <span className="font-medium text-gray-900">your</span>{' '}
                    energy and sleep — not a generic 9-to-5. Answer four quick questions
                    (about 30 seconds) so the AI schedules demanding work when you're actually
                    at your best.
                  </p>
                  <p className="text-sm text-gray-500 mt-3">
                    You can change any of this later in Settings.
                  </p>
                </div>
              )}

              {/* Step 1 — Energy preference */}
              {step === 1 && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    When are you most productive?
                  </h2>
                  <p className="text-gray-600 mb-5 text-sm">
                    We'll schedule your hardest tasks in this window.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {ENERGY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => choosePreference(option.value)}
                        className={clsx(
                          'p-4 rounded-2xl border text-left transition-all',
                          preference === option.value
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <p className="font-medium text-gray-900">{option.label}</p>
                        <p className="text-sm text-gray-500">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2 — Peak focus window */}
              {step === 2 && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    Your peak focus window
                  </h2>
                  <p className="text-gray-600 mb-5 text-sm">
                    We pre-filled this from your answer — tweak it if you like.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="time"
                      label="Focus starts"
                      value={peakStart}
                      onChange={(e) => setPeakStart(e.target.value)}
                      leftIcon={<Sun className="w-4 h-4" />}
                    />
                    <Input
                      type="time"
                      label="Focus ends"
                      value={peakEnd}
                      onChange={(e) => setPeakEnd(e.target.value)}
                      leftIcon={<Sun className="w-4 h-4" />}
                    />
                  </div>
                </div>
              )}

              {/* Step 3 — Sleep */}
              {step === 3 && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    When do you sleep and wake?
                  </h2>
                  <p className="text-gray-600 mb-5 text-sm">
                    Taskly won't schedule work into your wind-down or sleep hours.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="time"
                      label="Wake up"
                      value={wakeTime}
                      onChange={(e) => setWakeTime(e.target.value)}
                      leftIcon={<Sun className="w-4 h-4" />}
                    />
                    <Input
                      type="time"
                      label="Sleep"
                      value={sleepTime}
                      onChange={(e) => setSleepTime(e.target.value)}
                      leftIcon={<Moon className="w-4 h-4" />}
                    />
                  </div>
                </div>
              )}

              {/* Step 4 — Max daily workload */}
              {step === 4 && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    How much can you take on in a day?
                  </h2>
                  <p className="text-gray-600 mb-5 text-sm">
                    The AI keeps your planned focus work under this cap.
                  </p>
                  <div className="flex gap-2">
                    {[4, 6, 8, 10, 12].map((hours) => (
                      <button
                        key={hours}
                        onClick={() => setMaxHours(hours)}
                        className={clsx(
                          'flex-1 py-3 rounded-2xl border text-sm font-medium transition-all',
                          maxHours === hours
                            ? 'border-blue-500 bg-blue-50 text-blue-600 ring-1 ring-blue-500'
                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                        )}
                      >
                        {hours}h
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Footer actions */}
          <div className="flex items-center justify-between mt-8">
            <div>
              {step > 0 ? (
                <Button variant="ghost" onClick={back} disabled={saving} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                  Back
                </Button>
              ) : (
                <button
                  onClick={skip}
                  disabled={saving}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                >
                  Skip for now
                </button>
              )}
            </div>

            {step < TOTAL_STEPS - 1 ? (
              <Button variant="primary" onClick={next} rightIcon={<ArrowRight className="w-4 h-4" />}>
                {step === 0 ? 'Get started' : 'Continue'}
              </Button>
            ) : (
              <Button variant="primary" onClick={persist} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>
                Finish setup
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
