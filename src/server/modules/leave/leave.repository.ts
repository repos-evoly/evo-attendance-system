import { prisma } from "@/server/prisma";
import type { LeaveStatus, LeaveType } from "@prisma/client";
import type { AttendanceLeave } from "../attendance/attendance.repository";
import type {
  CancelEmployeeLeaveInput,
  CreateEmployeeLeaveInput,
  EmployeeLeavePeriod,
  EmployeeLeaveRecord,
} from "./leave.types";

/** `@db.Date` columns are returned as UTC-midnight `Date` objects. */
function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** UTC midnight for a `YYYY-MM-DD` value, the shape `@db.Date` expects. */
function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Relations joined so the API can report the employee name and the acting
 * users without a second request. Prisma infers the payload type from this.
 */
const LEAVE_INCLUDE = {
  employee: { select: { fullName: true } },
  createdBy: { select: { username: true } },
  cancelledBy: { select: { username: true } },
};

interface EmployeeLeaveRow {
  leaveId: bigint;
  employeeId: number;
  dateFrom: Date;
  dateTo: Date;
  leaveType: LeaveType;
  status: LeaveStatus;
  reason: string | null;
  createdById: bigint;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelledById: bigint | null;
  cancellationReason: string | null;
  employee: { fullName: string };
  createdBy: { username: string };
  cancelledBy: { username: string } | null;
}

function toRecord(row: EmployeeLeaveRow): EmployeeLeaveRecord {
  return {
    leaveId: row.leaveId.toString(),
    employeeId: row.employeeId,
    employeeName: row.employee.fullName,
    dateFrom: toDateString(row.dateFrom),
    dateTo: toDateString(row.dateTo),
    leaveType: row.leaveType,
    status: row.status,
    reason: row.reason,
    createdById: row.createdById.toString(),
    createdByName: row.createdBy.username,
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancelledById: row.cancelledById ? row.cancelledById.toString() : null,
    cancelledByName: row.cancelledBy ? row.cancelledBy.username : null,
    cancellationReason: row.cancellationReason,
  };
}

/** True when the employee row exists (any status). */
export async function employeeExists(employeeId: number): Promise<boolean> {
  const employee = await prisma.employee.findUnique({
    where: { employeeId },
    select: { employeeId: true },
  });

  return employee !== null;
}

/**
 * All leave records, newest first; optionally scoped to one employee.
 *
 * Active and cancelled records are both returned - the Leaves page needs the
 * cancelled ones too, so nothing is filtered out here.
 */
export async function listEmployeeLeaves(
  employeeId?: number,
): Promise<EmployeeLeaveRecord[]> {
  const rows = await prisma.employeeLeave.findMany({
    where: employeeId === undefined ? undefined : { employeeId },
    include: LEAVE_INCLUDE,
    orderBy: [{ dateFrom: "desc" }, { leaveId: "desc" }],
  });

  return rows.map(toRecord);
}

/** One leave record with its audit relations, or null when it does not exist. */
export async function getEmployeeLeave(
  leaveId: bigint,
): Promise<EmployeeLeaveRecord | null> {
  const row = await prisma.employeeLeave.findUnique({
    where: { leaveId },
    include: LEAVE_INCLUDE,
  });

  return row ? toRecord(row) : null;
}

/**
 * Every ACTIVE leave period of one employee, used for the overlap check.
 *
 * Cancelled periods are excluded, so a new leave may reuse dates that an
 * earlier (cancelled) leave used to occupy.
 */
export async function listLeavePeriods(
  employeeId: number,
): Promise<AttendanceLeave[]> {
  const rows = await prisma.employeeLeave.findMany({
    where: { employeeId, status: "ACTIVE" },
    select: { employeeId: true, dateFrom: true, dateTo: true, leaveType: true },
    orderBy: { dateFrom: "asc" },
  });

  return rows.map((row) => ({
    employeeId: row.employeeId,
    dateFrom: toDateString(row.dateFrom),
    dateTo: toDateString(row.dateTo),
    leaveType: row.leaveType,
  }));
}

/**
 * ACTIVE leave periods overlapping `[startDate, endDate]` for all employees,
 * with the detail fields the reports show when a manager inspects a leave day.
 *
 * A single query serves both consumers: the attendance calculators read only
 * `employeeId`/`dateFrom`/`dateTo` (whole periods, so a period crossing the
 * month boundary stays one row), while the Daily and Monthly reports also need
 * the leave type, reason and audit trail.
 *
 * Only ACTIVE rows are returned, so a cancelled leave never surfaces here - the
 * same rule that removes it from the attendance calculation.
 */
export async function getLeaveDetailsForRange(
  startDate: string,
  endDate: string,
): Promise<EmployeeLeavePeriod[]> {
  const rows = await prisma.employeeLeave.findMany({
    where: {
      status: "ACTIVE",
      dateFrom: { lte: toDatabaseDate(endDate) },
      dateTo: { gte: toDatabaseDate(startDate) },
    },
    select: {
      leaveId: true,
      employeeId: true,
      dateFrom: true,
      dateTo: true,
      leaveType: true,
      reason: true,
      createdAt: true,
      createdBy: { select: { username: true } },
    },
    orderBy: [{ employeeId: "asc" }, { dateFrom: "asc" }],
  });

  return rows.map((row) => ({
    employeeId: row.employeeId,
    dateFrom: toDateString(row.dateFrom),
    dateTo: toDateString(row.dateTo),
    leaveId: row.leaveId.toString(),
    leaveType: row.leaveType,
    reason: row.reason,
    createdByName: row.createdBy.username,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** ACTIVE leave periods covering `date` (inclusive) - a one-day range. */
export function getLeaveDetailsForDate(
  date: string,
): Promise<EmployeeLeavePeriod[]> {
  return getLeaveDetailsForRange(date, date);
}

export async function createEmployeeLeave(
  input: CreateEmployeeLeaveInput,
): Promise<EmployeeLeaveRecord> {
  const created = await prisma.employeeLeave.create({
    data: {
      employeeId: input.employeeId,
      dateFrom: toDatabaseDate(input.dateFrom),
      dateTo: toDatabaseDate(input.dateTo),
      leaveType: input.leaveType,
      reason: input.reason,
      createdById: input.createdById,
    },
    include: LEAVE_INCLUDE,
  });

  return toRecord(created);
}

/**
 * Cancels one ACTIVE leave record, keeping the original row.
 *
 * The `status = 'ACTIVE'` guard makes the update atomic: a second cancellation
 * matches no row and returns null instead of overwriting the first
 * cancellation's audit data.
 */
export async function cancelEmployeeLeave(
  leaveId: bigint,
  input: CancelEmployeeLeaveInput,
): Promise<EmployeeLeaveRecord | null> {
  const result = await prisma.employeeLeave.updateMany({
    where: { leaveId, status: "ACTIVE" },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: input.cancelledById,
      cancellationReason: input.reason,
    },
  });

  if (result.count === 0) return null;

  return getEmployeeLeave(leaveId);
}

/**
 * True when the employee has an ACTIVE leave covering `date` (inclusive).
 *
 * A cancelled leave is ignored, so the day is eligible for a waiver again.
 */
export async function isEmployeeOnLeave(
  employeeId: number,
  date: string,
): Promise<boolean> {
  const day = toDatabaseDate(date);
  const count = await prisma.employeeLeave.count({
    where: {
      employeeId,
      status: "ACTIVE",
      dateFrom: { lte: day },
      dateTo: { gte: day },
    },
  });

  return count > 0;
}
