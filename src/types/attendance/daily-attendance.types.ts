/**
 * Types mirroring `GET /api/v1/attendance/daily?date=YYYY-MM-DD`.
 *
 * The endpoint returns the backend calculator output verbatim, so these types
 * follow the server `AttendanceStatus` union and `DailyAttendanceRow` shape.
 * These are display contracts only - no attendance logic lives in the frontend.
 */

export type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "IN_PROGRESS"
  | "MISSING_OUT"
  | "MISSING_IN"
  | "PENDING"
  | "ABSENT"
  | "LEAVE"
  | "NO_SHIFT"
  | "WEEKEND"
  | "PUBLIC_HOLIDAY";

/**
 * The ACTIVE leave covering a LEAVE day, returned with the daily row so the
 * report can show the full leave details without a second request. Null for
 * every other status.
 */
export interface DailyAttendanceLeave {
  leaveId: string;
  employeeId: number;
  leaveType: "VACATION" | "SICK_LEAVE" | "UNPAID";
  dateFrom: string;
  dateTo: string;
  reason: string | null;
  createdByName: string;
  createdAt: string;
}

/** One employee's attendance for a single calendar day. */
export interface DailyAttendanceRow {
  employeeId: number;
  fullName: string;
  shiftName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  punchCount: number;
  workedMinutes: number | null;
  lateMinutes: number;
  status: AttendanceStatus;
  requiredMinutes: number | null;
  actualMinutes: number | null;
  missingMinutes: number | null;
  effectiveStart: string | null;
  /**
   * Stored `attendance.waiver` flag. A waived day is reported as PRESENT with
   * actual = required, missing = 0 and late = 0. Device punches are unaffected.
   */
  waiver: boolean;
  /** Covering active leave when the status is LEAVE; otherwise null. */
  leave: DailyAttendanceLeave | null;
}

/** Summary counters computed by the backend for the requested date. */
export interface DailyAttendanceSummary {
  total: number;
  /** Attending: all employees who have checked in (PRESENT + LATE + IN_PROGRESS) */
  attending: number;
  /** Late: LATE employees plus IN_PROGRESS employees with lateMinutes > 0 */
  late: number;
  /** Absent: scheduled employees with no check-in after shift end */
  absent: number;
  /** On Leave: employees with approved leave for the requested date */
  onLeave: number;
  /** Granular counts for internal use and other reports */
  present: number;
  inProgress: number;
  missingOut: number;
  missingIn: number;
  pending: number;
  leave: number;
  noShift: number;
  weekend: number;
  /** Employees on a public holiday for the requested date. */
  publicHoliday: number;
}

export interface DailyAttendanceResponse {
  date: string;
  summary: DailyAttendanceSummary;
  employees: DailyAttendanceRow[];
}
