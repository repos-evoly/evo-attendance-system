export interface ShiftAssignmentRecord {
  id: string;
  employeeId: number;
  employeeName: string;
  shiftId: number;
  shiftName: string;
  timeIn: string;
  timeOut: string;
  allowanceMinutes: number;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

export interface ShiftAssignmentPeriod {
  id: string;
  employeeId: number;
  shiftId: number;
  startDate: string;
  endDate: string | null;
}

export interface CreateShiftAssignmentInput {
  employeeId: number;
  shiftId: number;
  startDate: string;
  endDate: string | null;
}

export interface UpdateShiftAssignmentInput {
  shiftId?: number;
  startDate?: string;
  endDate?: string | null;
}

export type ShiftAssignmentErrorCode =
  | "EMPLOYEE_NOT_FOUND"
  | "EMPLOYEE_INACTIVE"
  | "SHIFT_NOT_FOUND"
  | "ASSIGNMENT_NOT_FOUND"
  | "INVALID_DATE"
  | "INVALID_DATE_RANGE"
  | "OVERLAPPING_ASSIGNMENT"
  | "DATABASE_ERROR";

export interface ShiftAssignmentError {
  code: ShiftAssignmentErrorCode;
  message: string;
}

export type CreateShiftAssignmentResult =
  | { ok: true; assignment: ShiftAssignmentRecord }
  | { ok: false; error: ShiftAssignmentError };

export type UpdateShiftAssignmentResult =
  | { ok: true; assignment: ShiftAssignmentRecord }
  | { ok: false; error: ShiftAssignmentError };
