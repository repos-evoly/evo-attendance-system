import { prisma } from "@/server/prisma";
import type { AttendanceEmployee, AttendancePunch } from "./attendance.repository";

export type { AttendanceEmployee, AttendancePunch };

export interface MonthlyAttendanceSource {
  employees: AttendanceEmployee[];
  punches: AttendancePunch[];
}

/**
 * Reads active employees, their assigned shifts,
 * and raw device punches for one local calendar month.
 *
 * This repository only retrieves data.
 * Attendance calculations belong in the calculator/service layer.
 */
export async function getMonthlyAttendanceSource(
  month: string,
): Promise<MonthlyAttendanceSource> {
  const employees = await prisma.$queryRaw<AttendanceEmployee[]>`
    SELECT
      e.employee_id AS "employeeId",
      e.full_name AS "fullName",
      e.shift_id AS "shiftId",
      s.name AS "shiftName",
      TO_CHAR(s.time_in, 'HH24:MI:SS') AS "timeIn",
      TO_CHAR(s.time_out, 'HH24:MI:SS') AS "timeOut",
      s.allowance_minutes AS "allowanceMinutes",
      TO_CHAR(e.hire_date, 'YYYY-MM-DD') AS "hireDate"
    FROM employee e
    LEFT JOIN shifts s ON s.shift_id = e.shift_id
    WHERE e.is_active = TRUE
    ORDER BY e.employee_id ASC
  `;

  const monthStart = `${month}-01`;
  const [year, monthNum] = month.split("-").map(Number);

  if (!year || !monthNum) {
    throw new Error(`Invalid month format: ${month}`);
  }

  const nextYear = monthNum === 12 ? year + 1 : year;
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;
  const nextMonthStart = `${nextYear}-${nextMonthNum.toString().padStart(2, "0")}-01`;

  const punches = await prisma.$queryRaw<AttendancePunch[]>`
    SELECT
      device_user_id AS "deviceUserId",
      TO_CHAR(punched_at_local, 'YYYY-MM-DD HH24:MI:SS.US') AS "punchedAtLocal",
      punch_type AS "punchType"
    FROM device_punches
    WHERE punched_at_local >= CAST(${monthStart} AS DATE)
      AND punched_at_local < CAST(${nextMonthStart} AS DATE)
    ORDER BY punched_at_local ASC
  `;

  return {
    employees,
    punches,
  };
}
