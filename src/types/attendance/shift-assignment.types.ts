export interface ShiftAssignment {
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

export interface CreateShiftAssignmentRequest {
  employeeId: number;
  shiftId: number;
  startDate: string;
  endDate?: string | null;
}

export interface UpdateShiftAssignmentRequest {
  shiftId?: number;
  startDate?: string;
  endDate?: string | null;
}
