"use client";

import { useMemo, useState } from "react";
import {
  Inbox,
  LoaderCircle,
  RefreshCw,
  Search,
  TriangleExclamationPoint,
} from "lucide-react";
import type { Employee, Shift } from "@/types/attendance/employee.types";
import {
  getShiftName,
  matchesEmployeeQuery,
} from "@/lib/attendance/employee.utils";
import { EmployeeTableRow } from "./EmployeeTableRow";

interface EmployeesTableProps {
  employees: Employee[];
  shiftLookup: Map<number, Shift>;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function EmployeesTable({
  employees,
  shiftLookup,
  isLoading,
  error,
  onRetry,
}: EmployeesTableProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => employees.filter((employee) => matchesEmployeeQuery(employee, query)),
    [employees, query]
  );

  const hasQuery = query.trim().length > 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="relative w-full max-w-md">
        <Search
          size={18}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or employee ID…"
          aria-label="Search employees"
          disabled={isLoading || Boolean(error)}
          className="glass-card w-full rounded-2xl py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="glass-card overflow-hidden rounded-3xl">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <EmptyState hasQuery={hasQuery} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3.5 pl-5 pr-4 font-semibold">Employee</th>
                  <th className="hidden py-3.5 pr-4 font-semibold md:table-cell">
                    ID
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold lg:table-cell">
                    Department
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold lg:table-cell">
                    Job title
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold xl:table-cell">
                    Shift
                  </th>
                  <th className="py-3.5 pr-4 font-semibold">Status</th>
                  <th className="py-3.5 pr-5">
                    <span className="sr-only">Open details</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((employee, index) => (
                  <EmployeeTableRow
                    key={employee.employeeId}
                    employee={employee}
                    shiftLabel={getShiftName(shiftLookup, employee.shiftId)}
                    index={index}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <LoaderCircle size={26} className="animate-spin text-violet-500" />
      <p className="text-sm text-slate-500">Loading employees…</p>
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">
        <Inbox size={22} />
      </span>
      <p className="text-sm font-medium text-slate-700">
        {hasQuery ? "No employees match your search" : "No employees yet"}
      </p>
      <p className="max-w-xs text-xs text-slate-500">
        {hasQuery
          ? "Try a different name or employee ID."
          : "Employees imported into the system will appear here."}
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <TriangleExclamationPoint size={22} />
      </span>
      <p className="text-sm font-medium text-slate-700">
        Could not load employees
      </p>
      <p className="max-w-sm text-xs text-slate-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
      >
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  );
}
