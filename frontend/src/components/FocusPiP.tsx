import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PictureInPicture2 } from 'lucide-react';
import { clsx } from 'clsx';
import { getRemainingSeconds, useFocusCountdownStore } from '@/stores';
import { useDocumentPiP } from '@/hooks/useDocumentPiP';

const formatCountdown = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const TONES: Record<string, { accent: string; label: string }> = {
  focus: { accent: '#f97316', label: 'Focus' },
  shortBreak: { accent: '#22c55e', label: 'Short break' },
  longBreak: { accent: '#38bdf8', label: 'Long break' },
};

// Whether to float the timer automatically on the next session. There is no
// explicit setting for this: closing the window opts out, opening it opts back
// in, so the button the user already presses records the preference.
const AUTO_KEY = 'taskly:focus-pip-auto';

const prefersAutoPopOut = (): boolean => {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
};

const setPrefersAutoPopOut = (value: boolean): void => {
  try {
    localStorage.setItem(AUTO_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable — auto-pop-out just won't persist */
  }
};

interface FocusPiPProps {
  className?: string;
  /** Show the button's text label alongside the icon. */
  showLabel?: boolean;
}

/**
 * "Pop out" control for the running focus timer. Uses the Document
 * Picture-in-Picture API to float the countdown in an always-on-top window that
 * stays visible after the browser is minimised. Chromium desktop only — renders
 * nothing where the API is missing, so no other platform sees a dead button.
 */
export default function FocusPiP({ className, showLabel = false }: FocusPiPProps) {
  const { supported, pipWindow, open, close } = useDocumentPiP();

  const isRunning = useFocusCountdownStore((s) => s.isRunning);
  const mode = useFocusCountdownStore((s) => s.mode);
  const timeLeft = useFocusCountdownStore((s) => s.timeLeft);
  const endsAt = useFocusCountdownStore((s) => s.endsAt);
  const taskName = useFocusCountdownStore((s) => s.taskName);
  const sessionTotalSeconds = useFocusCountdownStore((s) => s.sessionTotalSeconds);

  const [remaining, setRemaining] = useState(() => getRemainingSeconds(endsAt, timeLeft));

  useEffect(() => {
    setRemaining(getRemainingSeconds(endsAt, timeLeft));
    if (!isRunning) return;
    const id = window.setInterval(() => {
      setRemaining(getRemainingSeconds(endsAt, timeLeft));
    }, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, timeLeft, isRunning]);

  // The PiP document starts blank — it inherits no stylesheets from the opener,
  // which is why the contents below are inline-styled rather than Tailwind.
  useEffect(() => {
    if (!pipWindow) return;
    const doc = pipWindow.document;
    doc.title = 'Taskly timer';
    doc.body.style.margin = '0';
    doc.body.style.overflow = 'hidden';
    doc.body.style.background = '#0f172a';
  }, [pipWindow]);

  // Tear the window down as soon as the session ends so it can't linger empty.
  useEffect(() => {
    if (pipWindow && !isRunning) close();
  }, [pipWindow, isRunning, close]);

  // Float the timer automatically when a session starts. The window cannot be
  // opened on minimise — requestWindow() needs transient user activation, which
  // a visibilitychange has none of. Starting the timer *is* a click, and that
  // activation is still live here, so we open it up front and it is already
  // floating by the time the user switches away. If the timer began without an
  // interaction (a resume synced from the server) the call simply rejects.
  const wasRunningRef = useRef(isRunning);
  useEffect(() => {
    const justStarted = !wasRunningRef.current && isRunning;
    wasRunningRef.current = isRunning;
    if (justStarted && supported && !pipWindow && prefersAutoPopOut()) {
      void open();
    }
  }, [isRunning, supported, pipWindow, open]);

  const toggle = useCallback(() => {
    if (pipWindow) {
      setPrefersAutoPopOut(false);
      close();
    } else {
      setPrefersAutoPopOut(true);
      void open();
    }
  }, [pipWindow, open, close]);

  if (!supported || !isRunning) return null;

  const tone = TONES[mode] ?? TONES.focus;
  const elapsed = Math.max(0, sessionTotalSeconds - remaining);
  const pct = sessionTotalSeconds > 0 ? Math.min(100, (elapsed / sessionTotalSeconds) * 100) : 0;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title={
          pipWindow
            ? "Close the floating timer (it won't open automatically next session)"
            : 'Float the timer above other windows, now and on future sessions'
        }
        aria-label={pipWindow ? 'Close floating timer' : 'Pop out timer'}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
          pipWindow
            ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
          className
        )}
      >
        <PictureInPicture2 className="w-3.5 h-3.5" />
        {showLabel && (pipWindow ? 'Close pop-out' : 'Pop out')}
      </button>

      {pipWindow &&
        createPortal(
          <div
            onClick={() => {
              // Bring the real app forward; the PiP window is display-only.
              try {
                window.focus();
              } catch {
                /* opener may be gone */
              }
            }}
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 10,
              padding: '16px 18px',
              boxSizing: 'border-box',
              color: '#f8fafc',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: tone.accent,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                }}
              >
                {tone.label}
              </span>
            </div>

            <div
              style={{
                fontSize: 46,
                fontWeight: 700,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatCountdown(remaining)}
            </div>

            {taskName && (
              <div
                style={{
                  fontSize: 13,
                  color: '#cbd5e1',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {taskName}
              </div>
            )}

            <div
              style={{
                height: 4,
                borderRadius: 999,
                background: 'rgba(148,163,184,0.25)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: tone.accent,
                  borderRadius: 999,
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>,
          pipWindow.document.body
        )}
    </>
  );
}
