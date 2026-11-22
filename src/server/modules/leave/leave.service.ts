import {
  cancelEmployeeLeave,
  createEmployeeLeave,
  employeeExists,
  getEmployeeLeave,
  listEmployeeLeaves,
  listLeavePeriods,
} from "./leave.repository";
import { findOverlappingLeave } from "./leave.utils";
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

export type CreateLeaveResult =
  | { ok: true; leave: EmployeeLeaveRecord }
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

  return { ok: true, leave: await createEmployeeLeave(input) };
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
  | { ok: true; leave: EmployeeLeaveRecord }
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

  return { ok: true, leave: cancelled };
}
