"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Briefcase,
  Building,
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  CircleCheck,
  CircleX,
  Clock,
  Hash,
  Phone,
  TriangleExclamationPoint,
  type LucideIcon,
} from "lucide-react";
import type { Employee, Shift } from "@/types/attendance/employee.types";
import { formatDate, formatShiftSchedule } from "@/lib/attendance/employee.utils";
import {
  formatDuration,
  formatMonthLabel,
} from "@/lib/attendance/attendance.utils";
import type { UseMonthlyAttendanceResult } from "@/hooks/attendance/useMonthlyAttendance";
import { DATE_INPUT_CLASS } from "@/components/attendance/reports/ReportFilters";
import {
  ReportEmptyState,
  ReportErrorState,
} from "@/components/attendance/shared/ReportStates";
import type { StatTone } from "@/components/attendance/shared/StatCard";
import { EmployeeAvatar } from "./EmployeeAvatar";
import { EmployeeMonthlyAttendanceTable } from "./EmployeeMonthlyAttendanceTable";

interface EmployeeDetailsCardProps {
  employee: Employee;
  /** Resolved from `GET /api/v1/shifts`; null when unavailable. */
  shift: Shift | null;
  /** Selected month (`YYYY-MM`) for the monthly attendance block. */
  month: string;
  onMonthChange: (month: string) => void;
  /**
   * Existing `GET /api/v1/attendance/monthly-attendance` result. The card only
   * picks the row for this employee - it never recomputes attendance.
   */
  attendance: UseMonthlyAttendanceResult;
}

/** Compact chip palette mirroring the shared `StatCard` tones. */
const TILE_TONES: Record<StatTone, string> = {
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  sky: "bg-sky-50 text-sky-600 ring-sky-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

/**
 * Full-width stacked Employee Details layout:
 *   1. Profile bar - avatar, name and status on the left, details spread
 *      horizontally across the remaining space.
 *   2. Statistics row - the five monthly metrics in one row with the month
 *      picker on the right.
 *   3. Monthly attendance table - full page width, below the statistics.
 *
 * Values come from the existing monthly report response; nothing is recomputed.
 */
export function EmployeeDetailsCard({
  employee,
  shift,
  month,
  onMonthChange,
  attendance,
}: EmployeeDetailsCardProps) {
  const shiftValue = shift
    ? `${shift.name} · ${formatShiftSchedule(shift)}`
    : employee.shiftId != null
      ? `Shift #${employee.shiftId}`
      : null;

  const attendanceRow =
    attendance.data?.employees.find(
      (row) => row.employeeId === employee.employeeId
    ) ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full flex-col gap-5"
    >
      <section className="glass-card rounded-3xl p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex min-w-0 items-center gap-4 lg:w-64 lg:shrink-0">
            <EmployeeAvatar
              fullName={employee.fullName}
              employeeId={employee.employeeId}
              size="lg"
            />

            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-slate-900">
                {employee.fullName}
              </h2>
              <p className="mt-0.5 truncate text-sm text-slate-500">
                {[employee.jobTitle, employee.department]
                  .filter((value): value is string => Boolean(value))
                  .join(" · ") || `Employee #${employee.employeeId}`}
              </p>

              <span
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                  employee.isActive
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-slate-100 text-slate-600 ring-slate-200"
                }`}
              >
                {employee.isActive ? (
                  <CircleCheck size={13} />
                ) : (
                  <CircleX size={13} />
                )}
                {employee.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          <div
            aria-hidden
            className="hidden h-20 w-px shrink-0 bg-slate-200/80 lg:block"
          />

          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
            <ProfileDetail
              icon={Hash}
              label="Employee ID"
              value={`#${employee.employeeId}`}
            />
            <ProfileDetail
              icon={Building}
              label="Department"
              value={employee.department}
            />
            <ProfileDetail
              icon={Briefcase}
              label="Job title"
              value={employee.jobTitle}
            />
            <ProfileDetail icon={Phone} label="Phone" value={employee.phone} />
            <ProfileDetail
              icon={CalendarCheck}
              label="Hire date"
              value={employee.hireDate ? formatDate(employee.hireDate) : null}
            />
            <ProfileDetail
              icon={Clock}
              label="Assigned shift"
              value={shiftValue}
            />
          </dl>
        </div>
      </section>

      <section
        aria-label="Attendance statistics"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 text-slate-500">
          <ChartColumn size={16} aria-hidden className="text-violet-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Attendance statistics
          </h3>
          <span className="text-xs text-slate-400">
            · {formatMonthLabel(month)}
          </span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          {attendance.error ? (
            <div className="glass-card flex-1 rounded-2xl">
              <ReportErrorState
                message={attendance.error}
                onRetry={attendance.refetch}
              />
            </div>
          ) : attendanceRow === null && !attendance.isLoading ? (
            <div className="glass-card flex-1 rounded-2xl">
              <ReportEmptyState
                icon={<ChartColumn size={22} />}
                title="No monthly record"
                message={`No attendance was recorded for this employee in ${formatMonthLabel(
                  month
                )}.`}
              />
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
              <StatTile
                label="Late Days"
                value={attendanceRow?.lateDays ?? 0}
                icon={CalendarClock}
                tone="amber"
                isLoading={attendance.isLoading}
              />
              <StatTile
                label="Review Days"
                value={attendanceRow?.reviewDays ?? 0}
                icon={Activity}
                tone="violet"
                isLoading={attendance.isLoading}
              />
              <StatTile
                label="Required Hours"
                value={formatDuration(attendanceRow?.requiredMinutes)}
                icon={Clock}
                tone="sky"
                isLoading={attendance.isLoading}
              />
              <StatTile
                label="Actual Hours"
                value={formatDuration(attendanceRow?.actualMinutes)}
                icon={CircleCheck}
                tone="emerald"
                isLoading={attendance.isLoading}
              />
              <StatTile
                label="Discount Hours"
                value={formatDuration(attendanceRow?.missingMinutes)}
                icon={TriangleExclamationPoint}
                tone="rose"
                isLoading={attendance.isLoading}
              />
            </div>
          )}

          <div className="glass-card order-first flex w-full flex-col justify-center rounded-2xl p-4 sm:max-w-56 lg:order-last lg:w-44 lg:max-w-none xl:w-48">
            <label
              htmlFor="employee-attendance-month"
              className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Month
              <input
                id="employee-attendance-month"
                type="month"
                value={month}
                onChange={(event) => {
                  if (event.target.value) onMonthChange(event.target.value);
                }}
                className={DATE_INPUT_CLASS}
              />
            </label>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-400">
          Review days are working days whose punches are incomplete (missing
          check-in or check-out). Their scheduled hours count as missing until a
          waiver credits them. The table below lists every day of the month so a
          waiver can be enabled or revoked per day.
        </p>
      </section>

      <EmployeeMonthlyAttendanceTable
        employeeId={employee.employeeId}
        month={month}
        days={attendance.data?.days ?? null}
        isLoading={attendance.isLoading}
        error={attendance.error}
        onRefetch={attendance.refetch}
      />
    </motion.div>
  );
}

/** Compact label/value pair used across the profile bar. */
function ProfileDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        <Icon size={13} aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-slate-800">
        {value ?? "—"}
      </dd>
    </div>
  );
}

/** Compact metric tile for the statistics row. */
function StatTile({
  label,
  value,
  icon: Icon,
  tone,
  isLoading,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: StatTone;
  isLoading: boolean;
}) {
  return (
    <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${TILE_TONES[tone]}`}
      >
        <Icon size={16} />
      </span>

      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        {isLoading ? (
          <span
            aria-hidden
            className="mt-1 block h-5 w-12 animate-pulse rounded-md bg-slate-200"
          />
        ) : (
          <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
