import { useMemo } from 'react';
import { Clock, Lightbulb, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { AIPlanResponse } from '@/types';
import { computeTimeline, fmtHourLabel, fmtDuration, MIN_BLOCK_H } from './planTimeline';

/**
 * Graphical render of an AI plan: a compact vertical day-timeline (a shrunk
 * version of the Schedule page) plus a "couldn't fit" list and bulleted
 * recommendations. Presentation only — it reads the same AIPlanResponse the
 * Apply flow uses, so it never affects scheduling or persistence.
 */

interface PlanPreviewProps {
  plan: AIPlanResponse;
}

const TYPE_EMOJI: Record<string, string> = {
  deep_focus: '🧠',
  light_focus: '💡',
  admin: '📋',
  physical: '💪',
  recovery: '🌿',
};

// Priority dot colours mirror the 🔴🟡🟢 used elsewhere in the planner.
const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-green-500',
};

export default function PlanPreview({ plan }: PlanPreviewProps) {
  // Map task metadata (type/effort) by name so timeline blocks can show a
  // cognitive-type emoji. The AI returns tasks[] and plan[] keyed by the same name.
  const metaByName = useMemo(() => {
    const m = new Map<string, { type: string; effort: number }>();
    (plan.tasks || []).forEach((t) => {
      m.set(t.name.toLowerCase().trim(), {
        type: (t.type as unknown as string) || 'light_focus',
        effort: t.estimated_effort || 3,
      });
    });
    return m;
  }, [plan.tasks]);

  const { blocks, unscheduled, windowStart, span, pxPerMin, hourTicks, totalMin } = useMemo(
    () => computeTimeline(plan),
    [plan],
  );

  const hasTimeline = blocks.length > 0;
  const timelineHeight = span * pxPerMin;

  return (
    <div className="w-[320px] max-w-full">
      {/* Summary header */}
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-gray-900">
          {hasTimeline
            ? `${blocks.length} task${blocks.length > 1 ? 's' : ''} · ${fmtDuration(totalMin)}`
            : 'Suggested plan'}
        </span>
      </div>

      {/* Vertical timeline */}
      {hasTimeline && (
        <div className="relative mb-3" style={{ height: timelineHeight }}>
          {/* Hour tick lines + gutter labels */}
          {hourTicks.map((t) => {
            const top = (t - windowStart) * pxPerMin;
            return (
              <div key={t} className="absolute left-0 right-0" style={{ top }}>
                <div className="flex items-center">
                  <span className="w-11 pr-2 text-[10px] tabular-nums text-gray-400 text-right">
                    {fmtHourLabel(t)}
                  </span>
                  <div className="flex-1 border-t border-gray-100" />
                </div>
              </div>
            );
          })}

          {/* Task blocks */}
          {blocks.map((b, i) => {
            const top = (b.startMin - windowStart) * pxPerMin;
            const height = Math.max(MIN_BLOCK_H, (b.endMin - b.startMin) * pxPerMin);
            const emoji = TYPE_EMOJI[metaByName.get(b.name.toLowerCase().trim())?.type || ''] || '📌';
            const compact = height < 44;
            return (
              <div
                key={`${b.name}-${i}`}
                className="absolute rounded-lg bg-blue-500 text-white shadow-sm overflow-hidden"
                style={{ top, height, left: 52, right: 0 }}
                title={`${b.name} · ${b.startLabel}–${b.endLabel}`}
              >
                <div className="h-full px-2 py-1 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={clsx(
                        'w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white/50',
                        PRIORITY_DOT[b.priority] || 'bg-white',
                      )}
                    />
                    <span className="text-xs font-semibold truncate">
                      {emoji} {b.name}
                    </span>
                  </div>
                  {!compact && (
                    <span className="text-[10px] tabular-nums text-white/85 pl-3.5">
                      {b.startLabel}–{b.endLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tasks that couldn't be placed on the timeline */}
      {unscheduled.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300/60 bg-amber-50 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5 text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">Couldn't fit today</span>
          </div>
          <ul className="space-y-1">
            {unscheduled.map((u, i) => (
              <li key={`${u.name}-${i}`} className="flex items-center gap-1.5 text-xs text-gray-700">
                <span
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    PRIORITY_DOT[u.priority] || 'bg-gray-400',
                  )}
                />
                <span className="truncate">{u.name}</span>
                <span className="text-gray-400">· {u.duration}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {plan.recommendations && plan.recommendations.length > 0 && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5 text-blue-700">
            <Lightbulb className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">Recommendations</span>
          </div>
          <ul className="space-y-1">
            {plan.recommendations.slice(0, 4).map((rec, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-gray-700 leading-relaxed">
                <span className="text-blue-400 flex-shrink-0">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
