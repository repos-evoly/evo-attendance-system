import { getMonthlyAttendanceSource } from "./monthly-attendance.repository";
import {
  getAttendanceWaivers,
  type AttendanceLeave,
} from "./attendance.repository";
import { getLeaveDetailsForRange } from "../leave/leave.repository";
import type { EmployeeLeavePeriod } from "../leave/leave.types";
import {
  getPublicHolidaysForRange,
} from "../public-holiday/public-holiday.repository";
import {
  calculateMonthlyAttendance,
  calculateMonthlyDailyRecords,
  type MonthlyAttendanceDay,
  type MonthlyAttendanceRow,
} from "./monthly-attendance.calculator";

/**
 * One day row plus the ACTIVE leave covering it, so the Monthly report can name
 * the concrete leave type instead of a generic leave label. Null on every
 * non-leave day.
 */
export interface MonthlyAttendanceDayRow extends MonthlyAttendanceDay {
  leave: EmployeeLeavePeriod | null;
}

export interface MonthlyAttendanceResult {
  month: string;
  employees: MonthlyAttendanceRow[];
  /**
   * Per-day rows for the requested employee. Present only when the request
   * asked for a specific `employeeId`; the aggregate report omits it.
   */
  days?: MonthlyAttendanceDayRow[];
}

/** First and last calendar day of a `YYYY-MM` month, inclusive. */
function getMonthBounds(month: string): { firstDay: string; lastDay: string } {
  const [year, monthNum] = month.split("-").map(Number);

  if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
    throw new Error(`Invalid month format: ${month}`);
  }

  const lastDayNumber = new Date(year, monthNum, 0).getDate();

  return {
    firstDay: `${month}-01`,
    lastDay: `${month}-${String(lastDayNumber).padStart(2, "0")}`,
  };
}

export async function getMonthlyAttendance(
  month: string,
  employeeId?: number,
): Promise<MonthlyAttendanceResult> {
  const source = await getMonthlyAttendanceSource(month);
  const waiversRaw = await getAttendanceWaivers(month);
  const { firstDay, lastDay } = getMonthBounds(month);
  // Leave overlapping the month. Whole periods are passed through so a leave
  // crossing the month boundary stays a single row, and the same rows are
  // reused for the per-day display so the month is queried only once.
  const leaveDetails = await getLeaveDetailsForRange(firstDay, lastDay);
  // Public holidays overlapping the month. Whole periods are passed through.
  const publicHolidayDetails = await getPublicHolidaysForRange(firstDay, lastDay);

  // The calculators need the period bounds and the type, which decides whether
  // the day stays in Required Minutes (UNPAID) or is removed (VACATION/SICK).
  const leaves: AttendanceLeave[] = leaveDetails.map((leave) => ({
    employeeId: leave.employeeId,
    dateFrom: leave.dateFrom,
    dateTo: leave.dateTo,
    leaveType: leave.leaveType,
  }));

  // Convert public holidays to the minimal shape the calculator needs
  const publicHolidays = publicHolidayDetails.map((holiday) => ({
    dateFrom: holiday.dateFrom,
    dateTo: holiday.dateTo,
  }));

  // Convert waivers to Map keyed by "employeeId|attendanceDate"
  const waivers = new Map<string, boolean>();
  for (const w of waiversRaw) {
    const key = `${w.employeeId}|${w.attendanceDate}`;
    waivers.set(key, w.waiver);
  }

  const employees = calculateMonthlyAttendance({
    month,
    employees: source.employees,
    punches: source.punches,
    waivers,
    leaves,
    publicHolidays,
  });

  if (employeeId === undefined) {
    return {
      month,
      employees,
    };
  }

  const employee =
    source.employees.find((item) => item.employeeId === employeeId) ?? null;

  // Only this employee's leaves are needed for the per-day rows.
  const employeeLeaves = employee
    ? leaveDetails.filter((leave) => leave.employeeId === employee.employeeId)
    : [];

  const days: MonthlyAttendanceDayRow[] = employee
    ? calculateMonthlyDailyRecords({
        month,
        employee,
        punches: source.punches,
        waivers,
        leaves,
        publicHolidays,
      }).map((day) => ({
        ...day,
        // Attach the covering leave only to days the calculator reported as
        // LEAVE, so a weekend or out-of-period day inside a leave span is never
        // shown as an approved leave day.
        leave:
          day.status === "LEAVE"
            ? employeeLeaves.find(
                (leave) =>
                  leave.dateFrom <= day.date && leave.dateTo >= day.date,
              ) ?? null
            : null,
      }))
    : [];

  return {
    month,
    employees,
    days,
  };
}
