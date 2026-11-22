import type { LeaveStatus, LeaveType } from "@prisma/client";

/** The only leave types the system accepts, matching the `LeaveType` enum. */
export const LEAVE_TYPES = ["VACATION", "UNPAID", "SICK_LEAVE"] as const;

export type LeaveTypeValue = (typeof LEAVE_TYPES)[number];

/** True when `value` is one of the supported leave types. */
export function isLeaveType(value: unknown): value is LeaveType {
  return (
    typeof value === "string" &&
    (LEAVE_TYPES as readonly string[]).includes(value)
  );
}

/** The only leave statuses, matching the `LeaveStatus` enum. */
export const LEAVE_STATUSES = ["ACTIVE", "CANCELLED"] as const;

export type LeaveStatusValue = (typeof LEAVE_STATUSES)[number];

/**
 * Row shape returned by the leave API.
 *
 * `leaveId` / `createdById` / `cancelledById` are Postgres bigints and are
 * serialized as strings because JSON cannot represent `bigint`. Dates are
 * `YYYY-MM-DD`; `dateTo` is inclusive.
 *
 * A CANCELLED row keeps all of its original fields and adds the cancellation
 * audit data; records are never deleted.
 */
export interface EmployeeLeaveRecord {
  leaveId: string;
  employeeId: number;
  /** `employee.full_name`, joined so the table needs no second request. */
  employeeName: string;
  dateFrom: string;
  dateTo: string;
  leaveType: LeaveType;
  status: LeaveStatus;
  reason: string | null;
  createdById: string;
  /** `users.username` of the creator, joined for display. */
  createdByName: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledById: string | null;
  /** `users.username` of the canceller, joined for display. */
  cancelledByName: string | null;
  cancellationReason: string | null;
}

export interface CreateEmployeeLeaveInput {
  employeeId: number;
  dateFrom: string;
  dateTo: string;
  leaveType: LeaveType;
  reason: string | null;
  /** `users.user_id` of the acting user, taken from the verified session. */
  createdById: bigint;
}

export interface CancelEmployeeLeaveInput {
  /** Mandatory explanation, kept with the record for the audit trail. */
  reason: string;
  /** `users.user_id` of the acting user, taken from the verified session. */
  cancelledById: bigint;
}

/**
 * An ACTIVE leave period with the details the Daily Report shows for a day.
 *
 * It is a superset of the calculator's minimal leave period (employee + bounds),
 * so the same rows feed the attendance calculator and the leave detail dialog
 * without a second query.
 */
export interface EmployeeLeavePeriod {
  employeeId: number;
  dateFrom: string;
  dateTo: string;
  leaveId: string;
  leaveType: LeaveType;
  reason: string | null;
  /** `users.username` of the creator, joined for display. */
  createdByName: string;
  createdAt: string;
}
