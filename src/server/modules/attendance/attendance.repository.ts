
import type { LeaveType } from "@prisma/client";
import { prisma } from "@/server/prisma";
import type { DailyAttendanceRow } from "./attendance.calculator";

export interface AttendanceEmployee {
  employeeId: number;
  fullName: string;
  shiftId: number | null;
  shiftName: string | null;
  timeIn: string | null;
  timeOut: string | null;
  allowanceMinutes: number | null;
  /**
   * `employee.hire_date` as `YYYY-MM-DD`. Null when unknown. Leave is only
   * excluded from dates inside the employee's eligible employment period
   * (on or after the hire date).
   */
  hireDate?: string | null;
}

export interface AttendancePunch {
  deviceUserId: string;
  punchedAtLocal: string;
  punchType: number;
}

export interface DailyAttendanceSource {
  employees: AttendanceEmployee[];
  punches: AttendancePunch[];
}

export interface AttendanceWaiver {
  employeeId: number;
  attendanceDate: string;
  waiver: boolean;
}

/**
 * One approved leave period, both bounds inclusive (`YYYY-MM-DD`).
 *
 * The calculators receive these instead of a materialised per-day set, so a
 * period spanning a month boundary stays a single row.
 */
export interface AttendanceLeave {
  employeeId: number;
  dateFrom: string;
  dateTo: string;
  /**
   * Leave type. VACATION and SICK_LEAVE remove the day from Required Minutes,
   * while UNPAID keeps the scheduled minutes (counted as missing/discount).
   */
  leaveType: LeaveType;
}

/**
 * Reads active employees, their assigned shifts,
 * and raw device punches for one local calendar day.
 *
 * This repository only retrieves data.
 * Attendance calculations belong in the calculator/service layer.
 */
export async function getDailyAttendanceSource(
  date: string,
): Promise<DailyAttendanceSource> {
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

  const punches = await prisma.$queryRaw<AttendancePunch[]>`
    SELECT
      device_user_id AS "deviceUserId",
      TO_CHAR(punched_at_local, 'YYYY-MM-DD HH24:MI:SS.US') AS "punchedAtLocal",
      punch_type AS "punchType"
    FROM device_punches
    WHERE punched_at_local >= CAST(${date} AS DATE)
      AND punched_at_local < CAST(${date} AS DATE) + INTERVAL '1 day'
    ORDER BY punched_at_local ASC
  `;

  return {
    employees,
    punches,
  };
}

/**
 * Reads waiver values from the attendance table for a given month.
 * Waivers are keyed by both employeeId and attendanceDate.
 */
export async function getAttendanceWaivers(
  month: string,
): Promise<AttendanceWaiver[]> {
  const monthStart = `${month}-01`;
  const [year, monthNum] = month.split("-").map(Number);

  if (!year || !monthNum) {
    throw new Error(`Invalid month format: ${month}`);
  }

  const nextYear = monthNum === 12 ? year + 1 : year;
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;
  const nextMonthStart = `${nextYear}-${nextMonthNum.toString().padStart(2, "0")}-01`;

  // Note: Column name may be 'permission' in actual database due to schema drift
  // This query uses 'waiver' per Prisma schema. Adjust if needed.
  return await prisma.$queryRaw<AttendanceWaiver[]>`
    SELECT
      employee_id AS "employeeId",
      TO_CHAR(attendance_date, 'YYYY-MM-DD') AS "attendanceDate",
      waiver
    FROM attendance
    WHERE attendance_date >= CAST(${monthStart} AS DATE)
      AND attendance_date < CAST(${nextMonthStart} AS DATE)
    ORDER BY employee_id, attendance_date
  `;
}

/**
 * Reads waiver values from the attendance table for one local calendar day.
 * Waivers are keyed by both employeeId and attendanceDate.
 */
export async function getDailyAttendanceWaivers(
  date: string,
): Promise<AttendanceWaiver[]> {
  return await prisma.$queryRaw<AttendanceWaiver[]>`
    SELECT
      employee_id AS "employeeId",
      TO_CHAR(attendance_date, 'YYYY-MM-DD') AS "attendanceDate",
      waiver
    FROM attendance
    WHERE attendance_date = CAST(${date} AS DATE)
    ORDER BY employee_id
  `;
}

/** Audit data stored with a waiver decision: who acted and, for a grant, why. */
export interface WaiverAudit {
  /** Grant reason, or the optional revocation reason. Empty on a bare revoke. */
  reason: string;
  /** `users.user_id` of the acting user, taken from the verified session. */
  userId: bigint;
}

/**
 * Sets the stored waiver flag for one employee/day and updates the waiver audit
 * row in the same transaction, returning true when the value was persisted.
 *
 * Granting (`waiver = true`) inserts an audit row, or updates the one that is
 * still active. The one-waiver-per-employee-per-day rule is a partial unique
 * index over active rows (`revoked_at IS NULL`), so a waiver that was revoked
 * earlier no longer occupies the slot: granting again inserts a fresh row and
 * the revoked row stays as history.
 *
 * Revoking (`waiver = false`) never deletes the audit row. It stamps
 * `revoked_at`, `revoked_by_id` and the optional `revocation_reason`, so both
 * the grant and the revocation history survive repeated grant/revoke cycles.
 *
 * Only the `waiver` column is written on `attendance`. Device punches are never
 * touched: no punch row is read, created or updated, and `check_in` /
 * `check_out` are left exactly as they are.
 *
 * An attendance row is created only when the generator did not create one for
 * that day; it copies the scheduled times from the employee's shift, which is
 * the same minimum data `prisma/generate-attendance.ts` inserts.
 */
export async function setAttendanceWaiver(
  employeeId: number,
  date: string,
  waiver: boolean,
  audit: WaiverAudit,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE attendance
      SET waiver = ${waiver}
      WHERE employee_id = ${employeeId}
        AND attendance_date = CAST(${date} AS DATE)
    `;

    let persisted = updated > 0;

    if (!persisted) {
      const inserted = await tx.$executeRaw`
        INSERT INTO attendance (
          employee_id,
          attendance_date,
          shift_id,
          scheduled_in,
          scheduled_out,
          waiver
        )
        SELECT
          e.employee_id,
          CAST(${date} AS DATE),
          s.shift_id,
          s.time_in,
          s.time_out,
          ${waiver}
        FROM employee e
        JOIN shifts s ON s.shift_id = e.shift_id
        WHERE e.employee_id = ${employeeId}
          AND NOT EXISTS (
            SELECT 1
            FROM attendance a
            WHERE a.employee_id = e.employee_id
              AND a.attendance_date = CAST(${date} AS DATE)
          )
      `;

      persisted = inserted > 0;
    }

    if (!persisted) {
      return false;
    }

    if (waiver) {
      await tx.$executeRaw`
        INSERT INTO waivers (employee_id, waiver_date, reason, waived_by_id)
        VALUES (
          ${employeeId},
          CAST(${date} AS DATE),
          ${audit.reason},
          ${audit.userId}
        )
        ON CONFLICT (employee_id, waiver_date) WHERE revoked_at IS NULL
        DO UPDATE SET
          reason = EXCLUDED.reason,
          waived_by_id = EXCLUDED.waived_by_id,
          created_at = NOW()
      `;
    } else {
      await tx.$executeRaw`
        UPDATE waivers
        SET
          revoked_at = NOW(),
          revoked_by_id = ${audit.userId},
          revocation_reason = NULLIF(${audit.reason}, '')
        WHERE employee_id = ${employeeId}
          AND waiver_date = CAST(${date} AS DATE)
          AND revoked_at IS NULL
      `;
    }

    return true;
  });
}

/**
 * Persists calculated daily attendance results for a single date.
 *
 * Uses upsert based on the unique constraint (employeeId, attendanceDate).
 * Existing waiver values are preserved: the waiver column is never updated
 * during upsert, only set when creating new records (using the row's waiver value).
 *
 * Skips rows with missing shift information or WEEKEND status.
 *
 * @param date - The attendance date in YYYY-MM-DD format
 * @param rows - Calculated attendance rows from the calculator
 */
export async function persistDailyAttendance(
  date: string,
  rows: DailyAttendanceRow[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      // Skip rows without valid shift information
      if (!row.shiftId || !row.scheduledIn || !row.scheduledOut) {
        continue;
      }

      // Skip WEEKEND rows (non-working days)
      if (row.status === "WEEKEND") {
        continue;
      }

      // Convert checkIn/checkOut from HH:mm to TIMESTAMP
      // The calculator returns "09:30" format, we need to combine with date
      // Use UTC construction to avoid server timezone offset being applied
      const checkInTimestamp = row.checkIn
        ? (() => {
            const [year, month, day] = date.split("-").map(Number) as [
              number,
              number,
              number,
            ];
            const [hours, minutes] = row.checkIn!.split(":").map(Number) as [
              number,
              number,
            ];
            return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
          })()
        : null;
      const checkOutTimestamp = row.checkOut
        ? (() => {
            const [year, month, day] = date.split("-").map(Number) as [
              number,
              number,
              number,
            ];
            const [hours, minutes] = row.checkOut!.split(":").map(Number) as [
              number,
              number,
            ];
            return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
          })()
        : null;

      // Convert scheduledIn/scheduledOut from HH:mm:SS to TIME
      // These are already in the correct format from the repository
      // After the null check above, these are guaranteed to be non-null strings
      const scheduledInTime = new Date(`1970-01-01T${row.scheduledIn}`);
      const scheduledOutTime = new Date(`1970-01-01T${row.scheduledOut}`);

      await tx.attendance.upsert({
        where: {
          employeeId_attendanceDate: {
            employeeId: row.employeeId,
            attendanceDate: new Date(date),
          },
        },
        create: {
          employeeId: row.employeeId,
          attendanceDate: new Date(date),
          shiftId: row.shiftId,
          scheduledIn: scheduledInTime,
          scheduledOut: scheduledOutTime,
          checkIn: checkInTimestamp,
          checkOut: checkOutTimestamp,
          status: row.status,
          requiredMinutes: row.requiredMinutes,
          actualMinutes: row.actualMinutes,
          missingMinutes: row.missingMinutes,
          lateMinutes: row.lateMinutes,
          workedMinutes: row.workedMinutes,
          effectiveStart: row.effectiveStart,
          punchCount: row.punchCount,
          waiver: row.waiver, // Use the row's waiver value for new records
        },
        update: {
          shiftId: row.shiftId,
          scheduledIn: scheduledInTime,
          scheduledOut: scheduledOutTime,
          checkIn: checkInTimestamp,
          checkOut: checkOutTimestamp,
          status: row.status,
          requiredMinutes: row.requiredMinutes,
          actualMinutes: row.actualMinutes,
          missingMinutes: row.missingMinutes,
          lateMinutes: row.lateMinutes,
          workedMinutes: row.workedMinutes,
          effectiveStart: row.effectiveStart,
          punchCount: row.punchCount,
          // waiver is NOT included in update to preserve existing manual decisions
        },
      });
    }
  });
}
