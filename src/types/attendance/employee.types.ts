/**
 * Types mirroring the existing Employees / Shifts API responses.
 *
 * Every route in `src/app/api/v1` returns the same envelope:
 *   success -> { success: true, data }
 *   failure -> { success: false, message }
 */

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string };

/**
 * Row shape returned by `GET /api/v1/employees` (array) and
 * `GET /api/v1/employees/[employeeId]` (single object).
 *
 * Matches the Prisma `Employee` model. The endpoints return the plain row,
 * so the related shift is only available as `shiftId`.
 */
export interface Employee {
  employeeId: number;
  fullName: string;
  department: string | null;
  jobTitle: string | null;
  phone: string | null;
  /** ISO string, e.g. "2024-01-15T00:00:00.000Z". */
  hireDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  shiftId: number | null;
}

/**
 * Row shape returned by `GET /api/v1/shifts`.
 *
 * `timeIn` / `timeOut` come from Postgres `TIME(6)` columns, so they are
 * serialized as ISO strings anchored at 1970-01-01.
 */
export interface Shift {
  shiftId: number;
  name: string;
  timeIn: string;
  timeOut: string;
  allowanceMinutes: number;
  createdAt: string;
}
