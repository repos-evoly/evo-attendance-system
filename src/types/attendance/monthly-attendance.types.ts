/**
 * Types mirroring `GET /api/v1/attendance/monthly-attendance?month=YYYY-MM`.
 *
 * These follow the backend `MonthlyAttendanceRow` output. The frontend only
 * aggregates these values - it never recomputes attendance.
 */

import type { DailyAttendanceRow } from "./daily-attendance.types";

export interface MonthlyAttendanceRow {
  employeeId: number;
  fullName: string;
  lateDays: number;
  reviewDays: number;
  requiredMinutes: number;
  actualMinutes: number;
  missingMinutes: number;
  workedHours: number;
  missingHours: number;
}

/** One day's attendance row returned when the request includes `employeeId`. */
export interface MonthlyAttendanceDay extends DailyAttendanceRow {
  /** The calendar day this row belongs to (YYYY-MM-DD). */
  date: string;
}

export interface MonthlyAttendanceResponse {
  month: string;
  employees: MonthlyAttendanceRow[];
  /**
   * Per-day rows for the requested employee. Present only when the request
   * included an `employeeId`; the aggregate report omits it.
   */
  days?: MonthlyAttendanceDay[];
}
