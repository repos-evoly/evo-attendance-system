import type {
  AttendanceStatus,
  DailyAttendanceRow,
} from "@/types/attendance/daily-attendance.types";
import {
  LEAVE_TYPE_LABELS,
  type LeaveTypeValue,
} from "@/types/attendance/leave.types";
import type { PublicHoliday } from "@/types/attendance/public-holiday.types";

/**
 * Work progress states for UI display.
 * Combines attendance status with completion state without changing database.
 */
export type WorkProgress =
  | "in_progress"  // Checked in but not checked out
  | "completed"    // Both check-in and check-out recorded
  | "pending"      // No punches yet, before grace period
  | "absent"       // No punches after grace period
  | "missing_in"   // OUT punch but no IN punch
  | "missing_out"; // IN punch but no OUT punch after shift end

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const PLACEHOLDER = "—";

/**
 * Today as YYYY-MM-DD using local date getters, so the value never shifts
 * across a UTC boundary (which would send the wrong date to the API).
 */
export function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Today as YYYY-MM-DD in Libya local time (UTC+02:00).
 * Used for public holiday detection since holidays are defined in Libya time.
 */
export function libyaLocalDate(): string {
  const now = new Date();
  // Convert to Libya time (UTC+02:00)
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const libyaTime = new Date(utcTime + (2 * 60 * 60 * 1000));
  const year = libyaTime.getUTCFullYear();
  const month = String(libyaTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(libyaTime.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Current month as YYYY-MM using local date getters. */
export function currentLocalMonth(): string {
  return todayLocalDate().slice(0, 7);
}

/** "2026-11" -> "November 2026". Falls back to the raw value. */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  const name = MONTH_NAMES[Number(monthNumber) - 1];

  return year && name ? `${name} ${year}` : month;
}

/** "2026-11-03" -> "3 November 2026". */
export function formatLongDate(date: string): string {
  const [year, monthNumber, day] = date.split("-");
  const name = MONTH_NAMES[Number(monthNumber) - 1];

  if (!year || !name || !day) return date;

  return `${Number(day)} ${name} ${year}`;
}

/**
 * ISO timestamp -> local "YYYY-MM-DD HH:mm".
 *
 * Built from local date getters so the audit timestamps are shown in the
 * viewer's own timezone. Falls back to the raw value when it cannot be parsed.
 */
export function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  const pad = (part: number) => String(part).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Minutes -> "7h 30m". Nullish or non-finite input renders the placeholder. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return PLACEHOLDER;

  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;

  return `${hours}h ${rest}m`;
}

/** Case-insensitive match on an employee full name. */
export function matchesName(fullName: string, query: string): boolean {
  const needle = query.trim().toLowerCase();

  return needle.length === 0 || fullName.toLowerCase().includes(needle);
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  LATE: "Late",
  IN_PROGRESS: "In Progress",
  MISSING_OUT: "Missing Check-Out",
  MISSING_IN: "Missing Check-In",
  PENDING: "Pending",
  ABSENT: "Absent",
  LEAVE: "On Leave",
  NO_SHIFT: "No Shift",
  WEEKEND: "Weekend",
  PUBLIC_HOLIDAY: "Public Holiday",
};

export function getStatusLabel(status: AttendanceStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Display name of an approved leave type ("Vacation", "Sick Leave",
 * "Unpaid Leave").
 *
 * The Daily and Monthly reports show this instead of the generic "On Leave"
 * status text whenever the covering leave is known.
 */
export function getLeaveTypeLabel(leaveType: LeaveTypeValue): string {
  return LEAVE_TYPE_LABELS[leaveType];
}

/** Status order used when surfacing "requires attention" employees. */
export const ATTENTION_STATUSES: readonly AttendanceStatus[] = [
  "ABSENT",
  "MISSING_IN",
  "MISSING_OUT",
  "LATE",
];

/** Short explanation of why a status needs attention. */
export const ATTENTION_NOTES: Partial<Record<AttendanceStatus, string>> = {
  ABSENT: "Confirmed absence",
  MISSING_IN: "Missing check-in",
  MISSING_OUT: "Missing check-out",
  LATE: "Late arrival",
};

export function needsAttention(status: AttendanceStatus): boolean {
  return ATTENTION_STATUSES.includes(status);
}

/**
 * Statuses a stored waiver may finalize into a PRESENT day: a late arrival
 * (LATE) or a closed review day (MISSING_IN / MISSING_OUT). ABSENT keeps its
 * pre-existing waiver support. An ongoing day (IN_PROGRESS / PENDING) and a
 * non-working day (WEEKEND / NO_SHIFT) is never credited by a waiver.
 */
export const WAIVER_ELIGIBLE_STATUSES: readonly AttendanceStatus[] = [
  "LATE",
  "MISSING_IN",
  "MISSING_OUT",
  "ABSENT",
];

/** True when a waiver may finalize the given status. */
export function isWaiverEligibleStatus(status: AttendanceStatus): boolean {
  return WAIVER_ELIGIBLE_STATUSES.includes(status);
}

/**
 * Whether a manager may toggle the waiver for a row.
 *
 * Enabling requires an eligible status. Revoking is always allowed while the
 * waiver is set, because a waived day is reported as PRESENT and therefore no
 * longer matches the eligible status list.
 */
export function canToggleWaiver(
  row: Pick<DailyAttendanceRow, "status" | "waiver">
): boolean {
  return row.waiver || isWaiverEligibleStatus(row.status);
}

/**
 * Compute work progress from attendance status and punch state.
 * Used in UI to display combined status without changing database.
 *
 * Rules:
 * - IN_PROGRESS (checked in but not checked out): returns "in_progress"
 * - PRESENT or LATE with both punches: returns "completed"
 * - Missing punch cases: return respective missing state
 * - Absent/Pending: return respective state
 */
export function getWorkProgress(row: DailyAttendanceRow): WorkProgress {
  // Missing punch cases - these take precedence
  if (row.status === "MISSING_IN") return "missing_in";
  if (row.status === "MISSING_OUT") return "missing_out";

  // Absent (no punches after grace period)
  if (row.status === "ABSENT") return "absent";

  // Pending (no punches before grace period)
  if (row.status === "PENDING") return "pending";

  // IN_PROGRESS: checked in but not checked out
  if (row.status === "IN_PROGRESS") return "in_progress";

  // PRESENT or LATE: check if both punches exist for completed status
  if (row.status === "PRESENT" || row.status === "LATE") {
    // Has both check-in and check-out means completed
    if (row.checkIn && row.checkOut) {
      return "completed";
    }
    // Has check-in but no check-out means in progress
    if (row.checkIn && !row.checkOut) {
      return "in_progress";
    }
    // Should not happen for PRESENT/LATE, but fallback
    return "completed";
  }

  // Non-working statuses don't have work progress
  return "in_progress"; // Default fallback
}

/**
 * Get the work progress label for UI display.
 */
export function getWorkProgressLabel(progress: WorkProgress): string {
  const labels: Record<WorkProgress, string> = {
    in_progress: "In Progress",
    completed: "Completed",
    pending: "Pending",
    absent: "Absent",
    missing_in: "Missing Check-In",
    missing_out: "Missing Check-Out",
  };
  return labels[progress];
}

/**
 * Finds an active public holiday that includes today's Libya date (UTC+02:00).
 * Returns null if no active holiday exists for today.
 *
 * A holiday is active if:
 * - It is not cancelled (cancelledAt is null)
 * - Today's date falls within the holiday's date range (inclusive)
 */
export function findActiveHolidayForToday(
  holidays: PublicHoliday[]
): PublicHoliday | null {
  const today = libyaLocalDate();

  return (
    holidays.find(
      (holiday) =>
        holiday.cancelledAt === null &&
        today >= holiday.dateFrom &&
        today <= holiday.dateTo
    ) ?? null
  );
}
