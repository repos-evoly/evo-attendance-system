import {
  getDailyAttendanceSource,
  getDailyAttendanceWaivers,
  persistDailyAttendance,
  setAttendanceWaiver,
} from "./attendance.repository";
import { calculateDailyAttendance } from "./attendance.calculator";
import {
  getLeaveDetailsForDate,
  isEmployeeOnLeave,
} from "../leave/leave.repository";
import {
  getPublicHolidaysForDate,
} from "../public-holiday/public-holiday.repository";

/** Converts stored waiver rows into the calculator's `employeeId|date` map. */
function toWaiverMap(
  waivers: Array<{ employeeId: number; attendanceDate: string; waiver: boolean }>,
): Map<string, boolean> {
  const map = new Map<string, boolean>();

  for (const row of waivers) {
    map.set(`${row.employeeId}|${row.attendanceDate}`, row.waiver);
  }

  return map;
}

export async function getDailyAttendance(date: string) {
  const source = await getDailyAttendanceSource(date);
  const waivers = toWaiverMap(await getDailyAttendanceWaivers(date));
  // Active leave for this single day, with the details the report shows when a
  // manager inspects an "On Leave" day. Leave takes precedence over punches and
  // waivers in the reported minutes, but no raw punch is touched.
  const leaves = await getLeaveDetailsForDate(date);
  // Public holidays for this single day. Public holidays take precedence over
  // leave and waivers, but not over weekends.
  const publicHolidays = await getPublicHolidaysForDate(date);

  const calculated = calculateDailyAttendance({
    date,
    employees: source.employees,
    punches: source.punches,
    waivers,
    leaves,
    publicHolidays,
  });

  // Attach the covering leave only to days the calculator reported as LEAVE, so
  // a weekend/out-of-period day that merely fell inside a leave span is never
  // shown as an approved leave day.
  const leaveByEmployee = new Map(
    leaves.map((leave) => [leave.employeeId, leave]),
  );

  const employees = calculated.map((row) => ({
    ...row,
    leave: row.status === "LEAVE" ? leaveByEmployee.get(row.employeeId) ?? null : null,
  }));

  const summary = {
    total: employees.length,
    // Attending: all employees who have checked in (PRESENT + LATE + IN_PROGRESS)
    attending: employees.filter(
      (e) => e.status === "PRESENT" || e.status === "LATE" || e.status === "IN_PROGRESS"
    ).length,
    // Late: LATE employees plus IN_PROGRESS employees with lateMinutes > 0
    late: employees.filter(
      (e) => e.status === "LATE" || (e.status === "IN_PROGRESS" && e.lateMinutes > 0)
    ).length,
    // Absent: scheduled employees with no check-in after shift end (excludes leave and public holidays)
    absent: employees.filter((e) => e.status === "ABSENT").length,
    // On Leave: employees with approved leave today
    onLeave: employees.filter((e) => e.status === "LEAVE").length,
    // Keep granular counts for internal use and other reports
    present: employees.filter((e) => e.status === "PRESENT").length,
    inProgress: employees.filter((e) => e.status === "IN_PROGRESS").length,
    missingOut: employees.filter((e) => e.status === "MISSING_OUT").length,
    missingIn: employees.filter((e) => e.status === "MISSING_IN").length,
    pending: employees.filter((e) => e.status === "PENDING").length,
    leave: employees.filter((e) => e.status === "LEAVE").length,
    noShift: employees.filter((e) => e.status === "NO_SHIFT").length,
    weekend: employees.filter((e) => e.status === "WEEKEND").length,
    publicHoliday: employees.filter((e) => e.status === "PUBLIC_HOLIDAY").length,
  };

  return {
    date,
    summary,
    employees,
  };
}

/**
 * Recalculates one day's attendance and persists it to the `attendance`
 * table. This is the same read-calculates-persist sequence the Daily
 * Attendance API route performs; callers that change inputs the calculator
 * reads (e.g. leave records) use it to refresh stored rows without waiting
 * for someone to open that date's report.
 *
 * `persistDailyAttendance` upserts on (employeeId, attendanceDate) and never
 * writes `waiver` on update, so stored waiver decisions are preserved.
 */
export async function refreshAndPersistDailyAttendance(
  date: string,
): Promise<void> {
  const result = await getDailyAttendance(date);
  await persistDailyAttendance(date, result.employees);
}

export interface AttendanceWaiverState {
  employeeId: number;
  date: string;
  waiver: boolean;
}

export interface SetDailyAttendanceWaiverInput {
  employeeId: number;
  date: string;
  waiver: boolean;
  /** Grant reason (required to grant) or optional revocation reason. */
  reason: string;
  /** Acting user, taken from the verified session (never the request body). */
  userId: bigint;
}

/** Why a waiver mutation was rejected, so the route can pick the status code. */
export type AttendanceWaiverFailure = "not_found" | "on_leave" | "public_holiday";

export type AttendanceWaiverOutcome =
  | { ok: true; state: AttendanceWaiverState }
  | { ok: false; reason: AttendanceWaiverFailure };

/**
 * Enables or revokes the stored waiver for one employee/day.
 *
 * Granting requires a reason and is refused when the day is covered by an
 * approved leave or a public holiday. The `attendance.waiver` flag and the
 * `waivers` audit row are written in one transaction; device punches are never
 * created or modified. Revoking stamps the audit row instead of deleting it, so
 * the grant and the revocation are both preserved. The waiver is credited by the
 * calculators according to `WAIVER_ELIGIBLE_STATUSES`, and an unwaived review
 * day keeps its full missing minutes. Revoking only flips the flag back: the
 * day is recalculated from the untouched raw punches by the existing calculator.
 */
export async function setDailyAttendanceWaiver(
  input: SetDailyAttendanceWaiverInput,
): Promise<AttendanceWaiverOutcome> {
  if (input.waiver && (await isEmployeeOnLeave(input.employeeId, input.date))) {
    return { ok: false, reason: "on_leave" };
  }

  // Also prevent granting a waiver on a public holiday
  const publicHolidays = await getPublicHolidaysForDate(input.date);
  if (input.waiver && publicHolidays.length > 0) {
    return { ok: false, reason: "on_leave" }; // Reuse the same error code for simplicity
  }

  const persisted = await setAttendanceWaiver(
    input.employeeId,
    input.date,
    input.waiver,
    { reason: input.reason, userId: input.userId },
  );

  return persisted
    ? {
        ok: true,
        state: {
          employeeId: input.employeeId,
          date: input.date,
          waiver: input.waiver,
        },
      }
    : { ok: false, reason: "not_found" };
}
