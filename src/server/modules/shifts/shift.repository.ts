import { prisma } from "@/server/prisma";

export interface Shift {
  shiftId: number;
  name: string;
  timeIn: string;
  timeOut: string;
  allowanceMinutes: number;
}

export interface EmployeeWithShift {
  employeeId: number;
  fullName: string;
  shiftId: number | null;
  shiftName: string | null;
}

export interface ShiftManagementData {
  shifts: Shift[];
  employees: EmployeeWithShift[];
}

/**
 * Get all shifts with formatted time fields.
 */
export async function getAllShifts(): Promise<Shift[]> {
  const shifts = await prisma.shift.findMany({
    orderBy: {
      shiftId: "asc",
    },
  });

  return shifts.map((shift) => ({
    shiftId: shift.shiftId,
    name: shift.name,
    timeIn: shift.timeIn.toISOString().slice(11, 16),
    timeOut: shift.timeOut.toISOString().slice(11, 16),
    allowanceMinutes: shift.allowanceMinutes,
  }));
}

/**
 * Get all employees with their current shift assignment.
 */
export async function getAllEmployeesWithShifts(): Promise<EmployeeWithShift[]> {
  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
    },
    include: {
      shift: true,
    },
    orderBy: {
      employeeId: "asc",
    },
  });

  return employees.map((employee) => ({
    employeeId: employee.employeeId,
    fullName: employee.fullName,
    shiftId: employee.shiftId,
    shiftName: employee.shift?.name ?? null,
  }));
}

/**
 * Get all data needed for the shifts management page.
 */
export async function getShiftManagementData(): Promise<ShiftManagementData> {
  const [shifts, employees] = await Promise.all([
    getAllShifts(),
    getAllEmployeesWithShifts(),
  ]);

  return { shifts, employees };
}

/**
 * Assign a shift to an employee by updating Employee.shiftId.
 */
export async function assignShiftToEmployee(
  employeeId: number,
  shiftId: number,
): Promise<void> {
  await prisma.employee.update({
    where: {
      employeeId,
    },
    data: {
      shiftId,
    },
  });
}
