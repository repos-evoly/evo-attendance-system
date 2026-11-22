import { prisma } from "@/server/prisma";
import type {
  CreateShiftAssignmentInput,
  ShiftAssignmentPeriod,
  ShiftAssignmentRecord,
  UpdateShiftAssignmentInput,
} from "./shift-assignment.types";
import { toDatabaseDate, toDateString } from "./shift-assignment.utils";

const ASSIGNMENT_INCLUDE = {
  employee: {
    select: {
      fullName: true,
      isActive: true,
    },
  },
  shift: {
    select: {
      name: true,
      timeIn: true,
      timeOut: true,
      allowanceMinutes: true,
    },
  },
} as const;

interface EmployeeShiftRow {
  id: bigint;
  employeeId: number;
  shiftId: number;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  employee: {
    fullName: string;
    isActive: boolean;
  };
  shift: {
    name: string;
    timeIn: Date;
    timeOut: Date;
    allowanceMinutes: number;
  };
}

function toRecord(row: EmployeeShiftRow): ShiftAssignmentRecord {
  return {
    id: row.id.toString(),
    employeeId: row.employeeId,
    employeeName: row.employee.fullName,
    shiftId: row.shiftId,
    shiftName: row.shift.name,
    timeIn: row.shift.timeIn.toISOString().slice(11, 16),
    timeOut: row.shift.timeOut.toISOString().slice(11, 16),
    allowanceMinutes: row.shift.allowanceMinutes,
    startDate: toDateString(row.startDate),
    endDate: row.endDate ? toDateString(row.endDate) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Lists shift assignments, optionally filtered by employeeId. */
export async function listShiftAssignments(
  employeeId?: number,
): Promise<ShiftAssignmentRecord[]> {
  const rows = await prisma.employeeShift.findMany({
    where: employeeId !== undefined ? { employeeId } : undefined,
    include: ASSIGNMENT_INCLUDE,
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });

  return rows.map(toRecord);
}

/** Gets a single shift assignment by ID. */
export async function getShiftAssignmentById(
  id: bigint,
): Promise<ShiftAssignmentRecord | null> {
  const row = await prisma.employeeShift.findUnique({
    where: { id },
    include: ASSIGNMENT_INCLUDE,
  });

  return row ? toRecord(row) : null;
}

/** Lists simplified assignment periods for an employee to perform overlap checks. */
export async function listEmployeeAssignmentPeriods(
  employeeId: number,
): Promise<ShiftAssignmentPeriod[]> {
  const rows = await prisma.employeeShift.findMany({
    where: { employeeId },
    select: {
      id: true,
      employeeId: true,
      shiftId: true,
      startDate: true,
      endDate: true,
    },
    orderBy: { startDate: "asc" },
  });

  return rows.map((r) => ({
    id: r.id.toString(),
    employeeId: r.employeeId,
    shiftId: r.shiftId,
    startDate: toDateString(r.startDate),
    endDate: r.endDate ? toDateString(r.endDate) : null,
  }));
}

/** Checks whether an employee exists and whether they are active. */
export async function getEmployeeStatus(
  employeeId: number,
): Promise<{ exists: boolean; isActive: boolean } | null> {
  const employee = await prisma.employee.findUnique({
    where: { employeeId },
    select: { employeeId: true, isActive: true },
  });

  if (!employee) return null;

  return { exists: true, isActive: employee.isActive };
}

/** Checks whether a shift exists. */
export async function shiftExists(shiftId: number): Promise<boolean> {
  const shift = await prisma.shift.findUnique({
    where: { shiftId },
    select: { shiftId: true },
  });

  return Boolean(shift);
}

/** Creates a new shift assignment record. */
export async function createShiftAssignmentRecord(
  input: CreateShiftAssignmentInput,
): Promise<ShiftAssignmentRecord> {
  const created = await prisma.employeeShift.create({
    data: {
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      startDate: toDatabaseDate(input.startDate),
      endDate: input.endDate ? toDatabaseDate(input.endDate) : null,
    },
    include: ASSIGNMENT_INCLUDE,
  });

  return toRecord(created);
}

/** Updates an existing shift assignment record. */
export async function updateShiftAssignmentRecord(
  id: bigint,
  data: {
    shiftId?: number;
    startDate?: string;
    endDate?: string | null;
  },
): Promise<ShiftAssignmentRecord> {
  const updated = await prisma.employeeShift.update({
    where: { id },
    data: {
      ...(data.shiftId !== undefined ? { shiftId: data.shiftId } : {}),
      ...(data.startDate !== undefined
        ? { startDate: toDatabaseDate(data.startDate) }
        : {}),
      ...(data.endDate !== undefined
        ? { endDate: data.endDate ? toDatabaseDate(data.endDate) : null }
        : {}),
    },
    include: ASSIGNMENT_INCLUDE,
  });

  return toRecord(updated);
}
