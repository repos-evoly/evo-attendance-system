"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  LoaderCircle,
  RefreshCw,
  TriangleExclamationPoint,
  UserRound,
} from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { EmployeeDetailsCard } from "@/components/attendance/employees/EmployeeDetailsCard";
import { useEmployee, useShifts } from "@/hooks/attendance/useEmployees";
import { useMonthlyAttendance } from "@/hooks/attendance/useMonthlyAttendance";
import { currentLocalMonth } from "@/lib/attendance/attendance.utils";
import { buildShiftLookup, getShift } from "@/lib/attendance/employee.utils";

/** Accepts only positive integers; anything else is treated as invalid. */
function parseEmployeeId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || !/^\d+$/.test(raw)) return null;

  const id = Number(raw);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function EmployeeDetailsPage() {
  const params = useParams();
  const employeeId = parseEmployeeId(params?.employeeId);

  const [month, setMonth] = useState(() => currentLocalMonth());

  const { employee, isLoading, error, notFound, refetch } =
    useEmployee(employeeId);
  const { shifts } = useShifts();
  // The employee id is sent with the monthly request so the response also
  // carries one daily row per calendar day (single request, no per-day calls).
  const attendance = useMonthlyAttendance(month, employeeId);

  const shiftLookup = useMemo(() => buildShiftLookup(shifts), [shifts]);
  const shift = employee ? getShift(shiftLookup, employee.shiftId) : null;

  return (
    <>
      <DashboardHeader
        title={employee?.fullName ?? "Employee details"}
        description={
          employee
            ? `Employee #${employee.employeeId}`
            : "View an employee profile."
        }
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          {
            label: employee?.fullName ?? `#${params?.employeeId ?? "—"}`,
          },
        ]}
      />

      <div>
        <Link
          href="/employees"
          className="inline-flex items-center gap-2 rounded-xl px-1 text-sm font-medium text-slate-500 transition-colors hover:text-violet-600"
        >
          <ArrowLeft size={16} />
          Back to Employees
        </Link>
      </div>

      <div className="w-full">
        {employeeId === null ? (
          <StatePanel
            tone="neutral"
            icon={<UserRound size={22} />}
            title="Invalid employee"
            message="The employee link is not valid. Please choose an employee from the directory."
          />
        ) : isLoading ? (
          <StatePanel
            tone="neutral"
            icon={<LoaderCircle size={24} className="animate-spin" />}
            title="Loading employee…"
            message="Fetching the latest profile details."
          />
        ) : notFound ? (
          <StatePanel
            tone="neutral"
            icon={<UserRound size={22} />}
            title="Employee not found"
            message={`No employee exists with ID #${employeeId}.`}
          />
        ) : error ? (
          <StatePanel
            tone="error"
            icon={<TriangleExclamationPoint size={22} />}
            title="Could not load employee"
            message={error}
            action={
              <button
                type="button"
                onClick={refetch}
                className="mt-1 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
              >
                <RefreshCw size={14} />
                Try again
              </button>
            }
          />
        ) : employee ? (
          <EmployeeDetailsCard
            employee={employee}
            shift={shift}
            month={month}
            onMonthChange={setMonth}
            attendance={attendance}
          />
        ) : null}
      </div>
    </>
  );
}

function StatePanel({
  tone,
  icon,
  title,
  message,
  action,
}: {
  tone: "neutral" | "error";
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-card mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-3xl px-6 py-16 text-center">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
          tone === "error"
            ? "bg-rose-50 text-rose-500"
            : "bg-violet-50 text-violet-500"
        }`}
      >
        {icon}
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="max-w-sm text-xs text-slate-500">{message}</p>
      {action}
    </div>
  );
}
