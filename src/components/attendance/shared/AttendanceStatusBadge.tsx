import type { AttendanceStatus } from "@/types/attendance/daily-attendance.types";
import { getStatusLabel } from "@/lib/attendance/attendance.utils";

/**
 * Colour mapping follows the agreed semantics:
 * PRESENT green, LATE orange, IN_PROGRESS blue, MISSING_IN amber,
 * MISSING_OUT violet, ABSENT red, PENDING gray, NO_SHIFT / WEEKEND neutral.
 */
const STYLES: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  LATE: "bg-orange-50 text-orange-700 ring-orange-200",
  IN_PROGRESS: "bg-sky-50 text-sky-700 ring-sky-200",
  MISSING_OUT: "bg-violet-50 text-violet-700 ring-violet-200",
  MISSING_IN: "bg-amber-50 text-amber-700 ring-amber-200",
  ABSENT: "bg-rose-50 text-rose-700 ring-rose-200",
  LEAVE: "bg-teal-50 text-teal-700 ring-teal-200",
  PENDING: "bg-slate-100 text-slate-600 ring-slate-200",
  NO_SHIFT: "bg-slate-50 text-slate-500 ring-slate-200",
  WEEKEND: "bg-slate-50 text-slate-500 ring-slate-200",
  PUBLIC_HOLIDAY: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

const DOTS: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-500",
  LATE: "bg-orange-500",
  IN_PROGRESS: "bg-sky-500",
  MISSING_OUT: "bg-violet-500",
  MISSING_IN: "bg-amber-500",
  ABSENT: "bg-rose-500",
  LEAVE: "bg-teal-500",
  PENDING: "bg-slate-400",
  NO_SHIFT: "bg-slate-300",
  WEEKEND: "bg-slate-300",
  PUBLIC_HOLIDAY: "bg-indigo-500",
};

/**
 * Readable attendance status pill, shared by Home and the Daily report.
 *
 * `label` overrides the default status text: the reports pass the concrete
 * leave type on a LEAVE day so the badge never reads a generic "On Leave".
 *
 * `progressLabel` adds a work progress indicator (e.g., "In Progress", "Completed")
 * for the Daily Report when the employee has checked in.
 */
export function AttendanceStatusBadge({
  status,
  label,
  progressLabel,
}: {
  status: AttendanceStatus;
  label?: string;
  progressLabel?: string;
}) {
  const displayLabel = progressLabel
    ? `${label ?? getStatusLabel(status)} · ${progressLabel}`
    : (label ?? getStatusLabel(status));

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} />
      {displayLabel}
    </span>
  );
}
