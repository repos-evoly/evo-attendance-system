import {
  calculateDailyAttendance,
  isWithinEmploymentPeriod,
  type DailyAttendanceRow,
} from "./attendance.calculator";
import type {
  AttendanceEmployee,
  AttendanceLeave,
  AttendancePunch,
} from "./attendance.repository";

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

/** One employee's attendance for a single calendar day of the requested month. */
export interface MonthlyAttendanceDay extends DailyAttendanceRow {
  /** The calendar day this row belongs to (YYYY-MM-DD). */
  date: string;
}

interface CalculateMonthlyDailyRecordsInput {
  month: string;
  employee: AttendanceEmployee;
  punches: AttendancePunch[];
  waivers?: Map<string, boolean>; // Key: "employeeId|attendanceDate"
  leaves?: AttendanceLeave[]; // Approved leave periods (both bounds inclusive)
  publicHolidays?: { dateFrom: string; dateTo: string }[]; // Public holiday periods (both bounds inclusive)
}

/**
 * Builds one daily attendance row per calendar day of `month` for a single
 * employee.
 *
 * It reuses `calculateDailyAttendance` for each day, so the per-day view
 * reports exactly the same statuses, punches and hours as the Daily report,
 * including weekends, future dates (PENDING) and stored waivers. Nothing is
 * recomputed here, and no database record is read or written.
 */
export function calculateMonthlyDailyRecords({
  month,
  employee,
  punches,
  waivers,
  leaves,
  publicHolidays,
}: CalculateMonthlyDailyRecordsInput): MonthlyAttendanceDay[] {
  const days = getDaysInMonth(month);
  const rows: MonthlyAttendanceDay[] = [];

  for (const date of days) {
    const daily = calculateDailyAttendance({
      date,
      employees: [employee],
      punches,
      waivers,
      leaves,
      publicHolidays,
    });

    const row = daily[0];

    if (row) {
      rows.push({ ...row, date });
    }
  }

  return rows;
}

interface CalculateMonthlyAttendanceInput {
  month: string;
  employees: AttendanceEmployee[];
  punches: AttendancePunch[];
  waivers?: Map<string, boolean>; // Key: "employeeId|attendanceDate"
  leaves?: AttendanceLeave[]; // Approved leave periods (both bounds inclusive)
  publicHolidays?: { dateFrom: string; dateTo: string }[]; // Public holiday periods (both bounds inclusive)
}

/**
 * Gets all calendar days for a given month (YYYY-MM).
 */
function getDaysInMonth(month: string): string[] {
  const [year, monthNum] = month.split("-").map(Number);

  if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
    throw new Error(`Invalid month format: ${month}`);
  }

  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const days: string[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day.toString().padStart(2, "0");
    days.push(`${year}-${monthNum.toString().padStart(2, "0")}-${dayStr}`);
  }

  return days;
}

/**
 * Calculates monthly attendance report for all active employees.
 *
 * Rules:
 * - Reuses calculateDailyAttendance() for each calendar day.
 * - Aggregates requiredMinutes, actualMinutes, missingMinutes, lateDays by employee.
 * - Excludes Fridays, Saturdays, and future dates from totals.
 * - requiredMinutes is a schedule projection: every scheduled working day up to
 *   the current date contributes the employee's shift duration, independently of
 *   the day's attendance status or punches. Employees who share a shift and are
 *   equally eligible therefore always report identical Required Hours, including
 *   on a day that is still PENDING or IN_PROGRESS.
 * - For ABSENT without waiver: actual = 0, missing = required.
 * - For IN_PROGRESS: count as reviewDays only; the day is still ongoing, so no
 *   actual, missing or late minutes are finalized.
 * - For MISSING_IN / MISSING_OUT without waiver: keep the review status and
 *   count as reviewDays, and count the full scheduled duration as missing
 *   (the shortfall is not waived). actual stays 0 because the punch pair is
 *   incomplete.
 * - For WEEKEND, NO_SHIFT: exclude from totals.
 * - For LEAVE: VACATION and SICK_LEAVE add nothing to any total (their daily
 *   required/actual/missing are 0); UNPAID keeps the scheduled minutes in
 *   Required and counts them in full as missing. A leave day is never counted
 *   as late, review or absent.
 * - Waiver logic handled at daily level: a waiver turns an eligible day
 *   (LATE / MISSING_IN / MISSING_OUT / ABSENT) into PRESENT with
 *   actual = required, missing = 0 and late = 0, so a waived review day is no
 *   longer counted as a review day.
 *
 * This function does not access the database or modify records.
 */
/**
 * Gets today's date in Libya local time (UTC+02:00).
 * Exported for testing purposes.
 */
export function getLibyaToday(): string {
  const now = new Date();
  // Format as Libya time: add offset to UTC time
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const libyaTime = new Date(utcTime + (2 * 60 * 60 * 1000));
  const year = libyaTime.getUTCFullYear();
  const monthNum = String(libyaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(libyaTime.getUTCDate()).padStart(2, '0');
  return `${year}-${monthNum}-${day}`;
}

export function calculateMonthlyAttendance({
  month,
  employees,
  punches,
  waivers,
  leaves,
  publicHolidays,
}: CalculateMonthlyAttendanceInput): MonthlyAttendanceRow[] {
  const days = getDaysInMonth(month);
  const today = getLibyaToday();

  // Build a lookup map for hire dates to avoid repeated array searches
  const hireDateByEmployee = new Map<number, string | null>();
  for (const employee of employees) {
    hireDateByEmployee.set(employee.employeeId, employee.hireDate ?? null);
  }

  const byEmployee = new Map<number, {
    lateDays: number;
    reviewDays: number;
    requiredMinutes: number;
    actualMinutes: number;
    missingMinutes: number;
  }>();

  for (const employee of employees) {
    byEmployee.set(employee.employeeId, {
      lateDays: 0,
      reviewDays: 0,
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
    });
  }

  for (const date of days) {
    // Skip future dates
    if (date > today) continue;

    const dailyResult = calculateDailyAttendance({
      date,
      employees,
      punches,
      waivers,
      leaves,
      publicHolidays,
    });

    for (const row of dailyResult) {
      const current = byEmployee.get(row.employeeId);

      if (!current) {
        continue;
      }

      // Skip dates before the employee's hire date
      const hireDate = hireDateByEmployee.get(row.employeeId);
      if (!isWithinEmploymentPeriod(hireDate, date)) {
        continue;
      }

      // Required Hours are a schedule projection: a scheduled working day counts
      // once the date has arrived, whatever the day's status or punches are. This
      // runs before the status gate below so that a day which is still PENDING or
      // IN_PROGRESS contributes its full shift duration like any other scheduled
      // day, and employees sharing a shift always match.
      //
      // Leave days follow the per-type rule the daily calculator already applied:
      // VACATION and SICK_LEAVE carry required = 0 (so they add nothing), while
      // UNPAID carries the scheduled minutes and keeps them in Required Minutes.
      // Public holidays carry required = 0 (so they add nothing).
      if (
        row.status !== "WEEKEND" &&
        row.status !== "NO_SHIFT" &&
        row.status !== "PUBLIC_HOLIDAY" &&
        row.requiredMinutes !== null
      ) {
        current.requiredMinutes += row.requiredMinutes;
      }

      // Skip weekends, employees without shifts, PENDING (current day not ended),
      // and public holidays. A leave day is never an absence or a review day; its
      // required, actual and missing minutes are handled by the PRESENT/LATE branch below.
      if (
        row.status === "WEEKEND" ||
        row.status === "NO_SHIFT" ||
        row.status === "PENDING" ||
        row.status === "PUBLIC_HOLIDAY"
      ) {
        continue;
      }

      // Count late days only for statuses that contribute minutes (PRESENT, LATE)
      // IN_PROGRESS, MISSING_IN, and MISSING_OUT are marked for review and don't count as late days
      if (row.lateMinutes > 0 && (row.status === "LATE")) {
        current.lateDays += 1;
      }

      // Handle ABSENT: actual = 0, missing = required
      // Check for waiver before applying ABSENT logic
      const waiverKey = `${row.employeeId}|${date}`;
      const hasWaiver = waivers?.get(waiverKey) ?? false;

      if (row.status === "ABSENT" && row.requiredMinutes !== null) {
        if (hasWaiver) {
          // Waiver on ABSENT: actual = required, missing = 0
          current.actualMinutes += row.requiredMinutes;
        } else {
          // ABSENT without waiver: actual = 0, missing = required
          current.missingMinutes += row.requiredMinutes;
        }
        continue;
      }

      // Handle IN_PROGRESS on past dates: mark for review, do not count minutes
      if (row.status === "IN_PROGRESS") {
        current.reviewDays += 1;
        continue;
      }

      // Handle MISSING_OUT: incomplete day on a closed date.
      // Retains its review status and reviewDays count; the unwaived shortfall
      // counts in full toward missingMinutes (actual stays 0).
      if (row.status === "MISSING_OUT") {
        current.reviewDays += 1;
        if (row.requiredMinutes !== null) {
          current.missingMinutes += row.requiredMinutes;
        }
        continue;
      }

      // Handle MISSING_IN: same review handling as MISSING_OUT — the unwaived
      // shortfall counts in full toward missingMinutes.
      if (row.status === "MISSING_IN") {
        current.reviewDays += 1;
        if (row.requiredMinutes !== null) {
          current.missingMinutes += row.requiredMinutes;
        }
        continue;
      }

      // Handle PRESENT, LATE and LEAVE: use actual and missing from the daily
      // calculation. For VACATION/SICK_LEAVE both are 0 (no effect); for UNPAID
      // actual = 0 and missing = the full scheduled duration, so the day adds its
      // scheduled minutes to the monthly Discount Hours.
      if (
        row.status === "PRESENT" ||
        row.status === "LATE" ||
        row.status === "LEAVE"
      ) {
        if (row.actualMinutes !== null) {
          current.actualMinutes += row.actualMinutes;
        }
        if (row.missingMinutes !== null) {
          current.missingMinutes += row.missingMinutes;
        }
      }
    }
  }

  return employees.map((employee) => {
    const current = byEmployee.get(employee.employeeId) || {
      lateDays: 0,
      reviewDays: 0,
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
    };

    // Defensive: ensure all values are finite numbers before calculation
    const safeActualMinutes = Number.isFinite(current.actualMinutes) ? current.actualMinutes : 0;
    const safeMissingMinutes = Number.isFinite(current.missingMinutes) ? current.missingMinutes : 0;
    const safeRequiredMinutes = Number.isFinite(current.requiredMinutes) ? current.requiredMinutes : 0;
    const safeLateDays = Number.isFinite(current.lateDays) ? current.lateDays : 0;
    const safeReviewDays = Number.isFinite(current.reviewDays) ? current.reviewDays : 0;

    const workedHours = Math.floor(safeActualMinutes / 60);
    const missingHours = Math.floor(safeMissingMinutes / 60);

    return {
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      lateDays: safeLateDays,
      reviewDays: safeReviewDays,
      requiredMinutes: safeRequiredMinutes,
      actualMinutes: safeActualMinutes,
      missingMinutes: safeMissingMinutes,
      workedHours,
      missingHours,
    };
  });
}
