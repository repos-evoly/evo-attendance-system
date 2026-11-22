import { prisma } from "@/server/prisma";
import {
  assignShiftToEmployee,
  getShiftManagementData,
  type ShiftManagementData,
} from "./shift.repository";

export type AssignShiftResult =
  | { ok: true }
  | { ok: false; code: "INVALID_INPUT" | "EMPLOYEE_NOT_FOUND" | "SHIFT_NOT_FOUND" | "DATABASE_ERROR"; message: string };

/**
 * Get all shifts and employees with their current shift assignments.
 */
export async function getShiftsData(): Promise<ShiftManagementData> {
  return getShiftManagementData();
}

/**
 * Assign a shift to an employee.
 */
export async function assignShift(
  employeeId: number,
  shiftId: number,
): Promise<AssignShiftResult> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return { ok: false, code: "INVALID_INPUT", message: "Select an employee." };
  }
  if (!Number.isInteger(shiftId) || shiftId <= 0) {
    return { ok: false, code: "INVALID_INPUT", message: "Select a shift." };
  }

  try {
    // Verify employee exists
    const employee = await prisma.employee.findUnique({
      where: { employeeId },
      select: { employeeId: true },
    });

    if (!employee) {
      return { ok: false, code: "EMPLOYEE_NOT_FOUND", message: "The selected employee no longer exists." };
    }

    // Verify shift exists
    const shift = await prisma.shift.findUnique({
      where: { shiftId },
      select: { shiftId: true },
    });

    if (!shift) {
      return { ok: false, code: "SHIFT_NOT_FOUND", message: "The selected shift no longer exists." };
    }

    await assignShiftToEmployee(employeeId, shiftId);

    return { ok: true };
  } catch (error) {
    console.error("assignShift failed:", error instanceof Error ? error.message : error);
    return { ok: false, code: "DATABASE_ERROR", message: "Failed to assign shift. Please try again." };
  }
}
