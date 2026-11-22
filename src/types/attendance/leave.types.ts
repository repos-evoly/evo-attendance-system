/**
 * Types mirroring the existing `src/app/api/v1/leave` endpoints.
 *
 * The endpoints return the same envelope as every other route:
 *   success -> { success: true, data }
 *   failure -> { success: false, message }
 *
 * `leaveId` / `createdById` / `cancelledById` are Postgres bigints and arrive
 * as strings because JSON cannot represent `bigint`. Dates are `YYYY-MM-DD`
 * and `dateTo` is inclusive. These are display contracts only.
 */

export type LeaveTypeValue = "VACATION" | "UNPAID" | "SICK_LEAVE";

export type LeaveStatusValue = "ACTIVE" | "CANCELLED";

/** One leave record as returned by `GET /api/v1/leave`. */
export interface EmployeeLeave {
  leaveId: string;
  employeeId: number;
  employeeName: string;
  dateFrom: string;
  dateTo: string;
  leaveType: LeaveTypeValue;
  status: LeaveStatusValue;
  reason: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancellationReason: string | null;
}

/** Body of `POST /api/v1/leave`; `createdById` is resolved from the session. */
export interface CreateLeaveRequest {
  employeeId: number;
  dateFrom: string;
  dateTo: string;
  leaveType: LeaveTypeValue;
  reason?: string;
}

export const LEAVE_TYPE_LABELS: Record<LeaveTypeValue, string> = {
  VACATION: "Vacation",
  SICK_LEAVE: "Sick Leave",
  UNPAID: "Unpaid Leave",
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatusValue, string> = {
  ACTIVE: "Active",
  CANCELLED: "Cancelled",
};
