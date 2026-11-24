import {
  cancelEmployeeLeave,
  createEmployeeLeave,
  employeeExists,
  getEmployeeLeave,
  listEmployeeLeaves,
  listLeavePeriods,
} from "./leave.repository";
import { findOverlappingLeave } from "./leave.utils";
import { isWeekend } from "../attendance/attendance.calculator";
import { refreshAndPersistDailyAttendance } from "../attendance/attendance.service";
import { getLibyaToday } from "../attendance/monthly-attendance.calculator";
import type {
  CancelEmployeeLeaveInput,
  CreateEmployeeLeaveInput,
  EmployeeLeaveRecord,
} from "./leave.types";

/** Machine-readable failure codes so the route can pick the HTTP status. */
export type LeaveErrorCode =
  | "INVALID_RANGE"
  | "EMPLOYEE_NOT_FOUND"
  | "OVERLAP";

export interface LeaveError {
  code: LeaveErrorCode;
  message: string;
}

/**
 * Outcome of the attendance refresh that follows a leave mutation. The leave
 * itself is already committed when this runs, so failures are collected per
 * date instead of aborting the remaining refreshes; the route turns a
 * non-empty `failedDates` into an explicit error response.
 */
export interface AttendanceRefreshOutcome {
  /** Non-weekend dates up to today that were recalculated and persisted. */
  attemptedDates: number;
  /** Dates whose refresh threw; each is also logged server-side. */
  failedDates: string[];
}

/** Every `YYYY-MM-DD` from `start` to `end` inclusive (both validated dates). */
function* datesBetween(start: string, end: string): Generator<string> {
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);

  while (cursor <= last) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/**
 * Recalculates and persists attendance for every affected date of a leave:
 * each non-weekend day from `dateFrom` up to `min(dateTo, today)`. Future
 * dates are skipped because their attendance is still PENDING and will be
 * persisted when their own daily report is requested. Weekend days are
 * skipped because `persistDailyAttendance` would discard their WEEKEND rows
 * anyway.
 */
async function refreshAttendanceForLeave(
  leave: EmployeeLeaveRecord,
): Promise<AttendanceRefreshOutcome> {
  const today = getLibyaToday();
  const end = leave.dateTo < today ? leave.dateTo : today;
  const failedDates: string[] = [];
  let attemptedDates = 0;

  for (const date of datesBetween(leave.dateFrom, end)) {
    if (isWeekend(date)) continue;

    attemptedDates += 1;

    try {
      await refreshAndPersistDailyAttendance(date);
    } catch (error) {
      console.error(
        `Attendance refresh failed for ${date} after leave ${leave.leaveId}:`,
        error,
      );
      failedDates.push(date);
    }
  }

  return { attemptedDates, failedDates };
}

export type CreateLeaveResult =
  | {
      ok: true;
      leave: EmployeeLeaveRecord;
      attendanceRefresh: AttendanceRefreshOutcome;
    }
  | { ok: false; error: LeaveError };

/**
 * Creates one leave record.
 *
 * Business rules, all enforced here:
 * - `dateTo` must be on or after `dateFrom`;
 * - the employee must exist;
 * - the period must not overlap another ACTIVE leave of the same employee
 *   (both bounds inclusive). Cancelled periods are ignored, so a previously
 *   cancelled period can be re-booked.
 *
 * `createdById` always comes from the verified session, never the request body.
 */
export async function createLeave(
  input: CreateEmployeeLeaveInput,
): Promise<CreateLeaveResult> {
  if (input.dateTo < input.dateFrom) {
    return {
      ok: false,
      error: {
        code: "INVALID_RANGE",
        message: "dateTo must be on or after dateFrom.",
      },
    };
  }

  if (!(await employeeExists(input.employeeId))) {
    return {
      ok: false,
      error: { code: "EMPLOYEE_NOT_FOUND", message: "Employee not found." },
    };
  }

  const existing = await listLeavePeriods(input.employeeId);
  const overlap = findOverlappingLeave(existing, input.dateFrom, input.dateTo);

  if (overlap) {
    return {
      ok: false,
      error: {
        code: "OVERLAP",
        message: `The period overlaps an existing leave (${overlap.dateFrom} to ${overlap.dateTo}).`,
      },
    };
  }

  const leave = await createEmployeeLeave(input);
  const attendanceRefresh = await refreshAttendanceForLeave(leave);

  return { ok: true, leave, attendanceRefresh };
}

/** Lists leave records (active and cancelled), optionally for one employee. */
export async function listLeaves(
  employeeId?: number,
): Promise<EmployeeLeaveRecord[]> {
  return listEmployeeLeaves(employeeId);
}

/** Machine-readable cancellation failures, so the route can pick a status. */
export type CancelLeaveErrorCode = "NOT_FOUND" | "ALREADY_CANCELLED";

export interface CancelLeaveError {
  code: CancelLeaveErrorCode;
  message: string;
}

export type CancelLeaveResult =
  | {
      ok: true;
      leave: EmployeeLeaveRecord;
      attendanceRefresh: AttendanceRefreshOutcome;
    }
  | { ok: false; error: CancelLeaveError };

/**
 * Cancels an ACTIVE leave record.
 *
 * The record is never deleted: `status` becomes CANCELLED and the canceller,
 * the timestamp and the reason are stored alongside the original details.
 * Cancelling an unknown or already-cancelled leave is rejected, so the first
 * cancellation's audit data can never be overwritten.
 *
 * The acting user comes from the verified session, never the request body.
 */
export async function cancelLeave(
  leaveId: bigint,
  input: CancelEmployeeLeaveInput,
): Promise<CancelLeaveResult> {
  const existing = await getEmployeeLeave(leaveId);

  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Leave record not found." },
    };
  }

  if (existing.status === "CANCELLED") {
    return {
      ok: false,
      error: {
        code: "ALREADY_CANCELLED",
        message: "This leave is already cancelled.",
      },
    };
  }

  const cancelled = await cancelEmployeeLeave(leaveId, input);

  // The guarded update can still miss when the row was cancelled concurrently.
  if (!cancelled) {
    return {
      ok: false,
      error: {
        code: "ALREADY_CANCELLED",
        message: "This leave is already cancelled.",
      },
    };
  }

  const attendanceRefresh = await refreshAttendanceForLeave(cancelled);

  return { ok: true, leave: cancelled, attendanceRefresh };
}
