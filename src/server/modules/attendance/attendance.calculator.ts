
import type {
  AttendanceEmployee,
  AttendanceLeave,
  AttendancePunch,
} from "./attendance.repository";
import { isWaiverEligibleStatus } from "@/lib/attendance/attendance.utils";

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

export interface DailyAttendanceRow {
  employeeId: number;
  fullName: string;
  shiftName: string | null;
  shiftId: number | null;
  scheduledIn: string | null;
  scheduledOut: string | null;
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
   * Stored `attendance.waiver` flag for this employee/day. The flag is only
   * credited for the statuses listed in `WAIVER_ELIGIBLE_STATUSES`.
   */
  waiver: boolean;
}

/**
 * Statuses a waiver may finalize: a late arrival (LATE) or a closed review day
 * (MISSING_IN / MISSING_OUT). ABSENT keeps its pre-existing waiver support.
 * An ongoing day (IN_PROGRESS / PENDING) and a non-working day (WEEKEND /
 * NO_SHIFT) is never credited by a waiver.
 *
 * The rule lives in `attendance.utils` because the Daily Report and Employee
 * Details UI gate the waiver toggle on the same list.
 */

interface CalculateDailyAttendanceInput {
  date: string;
  employees: AttendanceEmployee[];
  punches: AttendancePunch[];
  now?: string;
  waivers?: Map<string, boolean>; // Key: "employeeId|attendanceDate", Value: hasWaiver
  leaves?: AttendanceLeave[]; // Approved leave periods (both bounds inclusive)
  publicHolidays?: { dateFrom: string; dateTo: string }[]; // Public holiday periods (both bounds inclusive)
}

/**
 * Converts HH:mm or HH:mm:ss into minutes.
 */
function minutesFromTime(time: string): number {
  const parts = time.split(":");

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2] ?? "0");

  if (
    parts.length < 2 ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    throw new Error(`Invalid time value: ${time}`);
  }

  return hours * 60 + minutes + seconds / 60;
}

/**
 * Extracts HH:mm from a local timestamp.
 */
function formatTime(timestamp: string): string {
  return timestamp.slice(11, 16);
}

/**
 * Extracts HH:mm:ss from a local timestamp for calculations.
 */
function formatTimeWithSeconds(timestamp: string): string {
  return timestamp.slice(11, 19);
}

/**
 * Extracts YYYY-MM-DD from a timestamp.
 */
function formatDate(date: string): string {
  return date.slice(0, 10);
}

/**
 * Friday and Saturday are weekends.
 */
export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();

  return day === 5 || day === 6;
}

/**
 * Creates a Date object from a Libya local time string (UTC+02:00).
 * All attendance data (punches, shift times) is stored in Libya local time.
 * Handles both local format ("YYYY-MM-DD HH:mm:ss") and UTC format ("YYYY-MM-DDTHH:mm:ss.000Z").
 */
function libyaDate(timestamp: string): Date {
  // Handle both "YYYY-MM-DD HH:mm:ss" and "YYYY-MM-DDTHH:mm:ss" formats
  let isoTimestamp = timestamp.replace(" ", "T");
  // Remove 'Z' suffix if present (UTC format)
  if (isoTimestamp.endsWith("Z")) {
    isoTimestamp = isoTimestamp.slice(0, -1);
  }
  // Append Libya timezone offset (+02:00) to ensure correct parsing
  return new Date(`${isoTimestamp}+02:00`);
}

/** True when `date` is on or after the hire date (or the hire date is unknown). */
export function isWithinEmploymentPeriod(
  hireDate: string | null | undefined,
  date: string,
): boolean {
  return !hireDate || date >= hireDate;
}

/** Indexes leave periods by employee so each day stays a simple lookup. */
function groupLeavesByEmployee(
  leaves: AttendanceLeave[] | undefined,
): Map<number, AttendanceLeave[]> {
  const byEmployee = new Map<number, AttendanceLeave[]>();

  for (const leave of leaves ?? []) {
    const list = byEmployee.get(leave.employeeId) ?? [];

    list.push(leave);
    byEmployee.set(leave.employeeId, list);
  }

  return byEmployee;
}

/**
 * True when `date` falls within any public holiday period (inclusive bounds).
 */
function isPublicHoliday(
  publicHolidays: { dateFrom: string; dateTo: string }[] | undefined,
  date: string,
): boolean {
  if (!publicHolidays || publicHolidays.length === 0) return false;

  return publicHolidays.some(
    (holiday) => date >= holiday.dateFrom && date <= holiday.dateTo
  );
}

/**
 * The leave period covering `date`, or null.
 *
 * A day counts as leave only when it is a scheduled working day inside the
 * employee's eligible employment period. Fridays/Saturdays are never leave
 * working days, and an employee without a shift has no scheduled day to waive.
 * The covering period is returned (not just a boolean) so the caller can apply
 * the per-type rule, since UNPAID keeps the scheduled minutes.
 */
function findLeaveDay(
  leaves: readonly AttendanceLeave[] | undefined,
  employee: AttendanceEmployee,
  date: string,
): AttendanceLeave | null {
  if (isWeekend(date)) return null;

  if (
    !employee.shiftId ||
    !employee.timeIn ||
    !employee.timeOut ||
    employee.allowanceMinutes === null
  ) {
    return null;
  }

  if (!isWithinEmploymentPeriod(employee.hireDate, date)) return null;

  return (
    (leaves ?? []).find(
      (leave) => date >= leave.dateFrom && date <= leave.dateTo,
    ) ?? null
  );
}

/**
 * Calculates daily attendance for all active employees.
 *
 * Rules:
 * - punch_type 0 = Check-in (IN).
 * - punch_type 1 = Check-out (OUT).
 * - IN only while the shift is still open: IN_PROGRESS, calculate late minutes from IN timestamp.
 * - IN only after the shift has ended: MISSING_OUT (needs review), late minutes still calculated,
 *   but no worked/actual/missing minutes are invented.
 * - OUT only: MISSING_IN, do not calculate late minutes.
 * - IN + OUT: use IN for check-in, OUT for check-out.
 * - Multiple IN/OUT: use first IN and last OUT (chronological pairing).
 * - No punches before shift end = PENDING.
 * - No punches after shift end = ABSENT.
 * - Late calculation respects the shift allowance.
 * - Friday and Saturday = WEEKEND.
 * - Employees without an assigned shift = NO_SHIFT.
 * - `waiver = true` credits the full scheduled duration (actual = required,
 *   missing = 0, late = 0, status = PRESENT) for LATE, MISSING_IN, MISSING_OUT
 *   and ABSENT days. Ongoing (IN_PROGRESS / PENDING) and non-working
 *   (WEEKEND / NO_SHIFT) days are never credited.
 * - Approved leave on a scheduled working day = LEAVE (never ABSENT). VACATION
 *   and SICK_LEAVE report zero required/actual/missing minutes; UNPAID keeps the
 *   scheduled minutes as required and counts them in full as missing.
 *
 * This function does not access the database or modify records.
 */
export function calculateDailyAttendance({
  date,
  employees,
  punches,
  now,
  waivers,
  leaves,
  publicHolidays,
}: CalculateDailyAttendanceInput): DailyAttendanceRow[] {
  const currentTime = now ? libyaDate(now) : new Date();

  if (Number.isNaN(currentTime.getTime())) {
    throw new Error(`Invalid current time: ${now}`);
  }

  const today = formatDate(currentTime.toISOString());
  const isToday = date === today;
  const isPastDate = date < today;

  // Exclude employees whose hire date is after the report date
  const eligibleEmployees = employees.filter((employee) =>
    isWithinEmploymentPeriod(employee.hireDate, date)
  );

  const leavesByEmployee = groupLeavesByEmployee(leaves);

  // Group punches by device user ID with punchType.
  const punchesByUser = new Map<string, Array<{ timestamp: string; punchType: number }>>();

  for (const punch of punches) {
    const timestamp = punch.punchedAtLocal;

    if (!timestamp.startsWith(`${date} `)) {
      continue;
    }

    const userPunches =
      punchesByUser.get(punch.deviceUserId) ?? [];

    userPunches.push({ timestamp, punchType: punch.punchType });

    punchesByUser.set(punch.deviceUserId, userPunches);
  }

  return eligibleEmployees.map((employee) => {
    // Sort punches chronologically.
    const userPunches = (
      punchesByUser.get(String(employee.employeeId)) ?? []
    ).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Separate IN (punchType 0) and OUT (punchType 1) punches.
    const inPunches = userPunches.filter((p) => p.punchType === 0);
    const outPunches = userPunches.filter((p) => p.punchType === 1);

    // Use first IN for check-in, last OUT for check-out.
    const firstIn = inPunches[0] ?? null;
    const lastOut = outPunches.length > 0 ? outPunches[outPunches.length - 1] : null;

    let checkIn = firstIn ? formatTime(firstIn.timestamp) : null;
    let checkOut = lastOut ? formatTime(lastOut.timestamp) : null;

    // Calculate required minutes from shift duration
    let requiredMinutes = employee.timeIn && employee.timeOut
      ? minutesFromTime(employee.timeOut) - minutesFromTime(employee.timeIn)
      : null;

    // Calculate effective start and actual minutes
    let effectiveStart: string | null = null;
    let actualMinutes: number | null = null;
    let missingMinutes: number | null = null;

    if (firstIn && lastOut && employee.timeIn && employee.timeOut && employee.allowanceMinutes !== null) {
      const scheduledIn = minutesFromTime(employee.timeIn);
      const allowedIn = scheduledIn + employee.allowanceMinutes;
      const actualIn = minutesFromTime(formatTimeWithSeconds(firstIn.timestamp));

      // Effective start rule:
      // - If first punch is before or within allowance period: effective start = scheduled start
      // - If first punch is after allowance period: effective start = first punch time
      const effectiveStartMinutes = actualIn <= allowedIn
        ? scheduledIn
        : actualIn;

      effectiveStart = `${Math.floor(effectiveStartMinutes / 60)}:${String(Math.floor(effectiveStartMinutes % 60)).padStart(2, '0')}`;

      // Calculate actual minutes using effective start (direct calculation to avoid precision loss)
      const lastOutTime = libyaDate(lastOut.timestamp).getTime();
      const effectiveStartTime = libyaDate(`${date} 00:00:00`).getTime() + (effectiveStartMinutes * 60000);
      const calculatedActualMinutes = Math.floor((lastOutTime - effectiveStartTime) / 60000);

      // Cap actual minutes at the employee's scheduled shift duration (not hardcoded).
      actualMinutes = requiredMinutes !== null
        ? Math.min(calculatedActualMinutes, requiredMinutes)
        : calculatedActualMinutes;

      // Calculate missing minutes from the capped actual minutes
      missingMinutes = requiredMinutes !== null ? Math.max(0, requiredMinutes - actualMinutes) : null;
    }

    // Calculate total time between first IN and last OUT (backward compatibility)
    let workedMinutes =
      firstIn && lastOut
        ? Math.floor(
            (libyaDate(lastOut.timestamp).getTime() -
              libyaDate(firstIn.timestamp).getTime()) /
              60000,
          )
        : null;

    let status: AttendanceStatus;
    let lateMinutes = 0;

    // Weekend takes precedence over everything
    if (isWeekend(date)) {
      status = "WEEKEND";
    } else if (isPublicHoliday(publicHolidays, date)) {
      // Public holiday applies to all active employees
      // Waiver does not override public holiday
      status = "PUBLIC_HOLIDAY";
      requiredMinutes = 0;
      actualMinutes = 0;
      missingMinutes = 0;
      lateMinutes = 0;
    } else if (
      !employee.shiftId ||
      !employee.timeIn ||
      !employee.timeOut ||
      employee.allowanceMinutes === null
    ) {
      status = "NO_SHIFT";
    } else if (firstIn && !lastOut) {
      // IN only: calculate late minutes from IN timestamp with seconds precision.
      const actualIn = minutesFromTime(formatTimeWithSeconds(firstIn.timestamp));
      const scheduledIn = minutesFromTime(employee.timeIn);

      const allowedIn =
        scheduledIn + employee.allowanceMinutes;

      // Grace period does not reduce the actual late minutes.
      // Example: 09:00 start, 15-minute allowance:
      // 09:10 = 0 late minutes.
      // 09:20 = 20 late minutes.
      lateMinutes =
        actualIn > allowedIn
          ? Math.floor(actualIn - scheduledIn)
          : 0;

      // The same "day has ended" convention used for ABSENT/PENDING:
      // a past date is closed, and today is closed once the shift end passed.
      const shiftEnd = libyaDate(`${date} ${employee.timeOut}`);
      const hasDayEnded = isPastDate || (isToday && currentTime >= shiftEnd);

      // A missing check-out on a closed day is a review case, not an
      // "in progress" one, and never a confirmed absence.
      status = hasDayEnded ? "MISSING_OUT" : "IN_PROGRESS";
      // actualMinutes and missingMinutes remain null: the punch pair is
      // incomplete, so no worked time may be assumed.
    } else if (!firstIn && lastOut) {
      // OUT only: missing IN, do not calculate late minutes.
      status = "MISSING_IN";
    } else if (firstIn && lastOut) {
      // IN + OUT: calculate late minutes from IN timestamp with seconds precision.
      const actualIn = minutesFromTime(formatTimeWithSeconds(firstIn.timestamp));
      const scheduledIn = minutesFromTime(employee.timeIn);

      const allowedIn =
        scheduledIn + employee.allowanceMinutes;

      lateMinutes =
        actualIn > allowedIn
          ? Math.floor(actualIn - scheduledIn)
          : 0;

      status = lateMinutes > 0
        ? "LATE"
        : "PRESENT";
    } else {
      // No punches at all.
      // For today, remain PENDING until shift start + allowance, then ABSENT.
      // Past dates are ABSENT immediately.
      // If they check in later, the calculator will reclassify them as PRESENT or LATE
      // based on the IN-only or IN+OUT logic above.
      const shiftStart = libyaDate(`${date} ${employee.timeIn}`);
      const allowanceEnd = new Date(shiftStart.getTime() + (employee.allowanceMinutes ?? 0) * 60000);

      status =
        isPastDate || (isToday && currentTime > allowanceEnd)
          ? "ABSENT"
          : "PENDING";
      // actualMinutes and missingMinutes remain null (no punches to calculate)
    }

    // Apply the stored waiver for this employee/day. A waiver credits the full
    // scheduled working duration: the day becomes a regular PRESENT day with
    // nothing missing and no late minutes. Device punches are never rewritten,
    // and an ongoing day (IN_PROGRESS) is never finalized by a waiver.
    const waiverKey = `${employee.employeeId}|${date}`;
    const hasWaiver = waivers?.get(waiverKey) ?? false;

    if (hasWaiver && requiredMinutes !== null && isWaiverEligibleStatus(status)) {
      actualMinutes = requiredMinutes;
      missingMinutes = 0;
      lateMinutes = 0;
      status = "PRESENT";
    }

    // Approved leave takes precedence over device punches: an ACTIVE leave
    // covering this date makes the day LEAVE even when punches exist. The raw
    // punches are never touched - they are simply not reported for a leave
    // day. Leave never overrides public holidays or weekends.
    //
    // VACATION and SICK_LEAVE remove the day from Required Minutes entirely
    // (required = actual = missing = 0). UNPAID is an authorised absence: the
    // shift's scheduled minutes stay in Required Minutes, nothing is worked
    // (actual = 0), and the whole scheduled duration counts as missing/discount.
    if (status !== "PUBLIC_HOLIDAY" && status !== "WEEKEND") {
      const leaveDay = findLeaveDay(
        leavesByEmployee.get(employee.employeeId),
        employee,
        date,
      );

      if (leaveDay) {
        status = "LEAVE";
        lateMinutes = 0;
        checkIn = null;
        checkOut = null;
        workedMinutes = 0;
        effectiveStart = null;

        if (leaveDay.leaveType === "UNPAID") {
          actualMinutes = 0;
          missingMinutes = requiredMinutes;
        } else {
          requiredMinutes = 0;
          actualMinutes = 0;
          missingMinutes = 0;
        }
      }
    }

    return {
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      shiftName: employee.shiftName,
      shiftId: employee.shiftId,
      scheduledIn: employee.timeIn,
      scheduledOut: employee.timeOut,
      checkIn,
      checkOut,
      punchCount: userPunches.length,
      workedMinutes,
      lateMinutes,
      status,
      requiredMinutes,
      actualMinutes,
      missingMinutes,
      effectiveStart,
      waiver: hasWaiver,
    };
  });
}
