"use client";

import { useMemo, useState } from "react";
import { Edit2, Search, X } from "lucide-react";
import type { Shift } from "@/types/attendance/employee.types";
import type { ShiftAssignment } from "@/types/attendance/shift-assignment.types";
import {
  formatLongDate,
  matchesName,
} from "@/lib/attendance/attendance.utils";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";

const CONTROL_CLASS =
  "glass-card rounded-2xl py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300";

interface ShiftAssignmentTableProps {
  assignments: ShiftAssignment[];
  shifts: Shift[];
  isLoading: boolean;
  error: string | null;
  canEdit?: boolean;
  onRetry: () => void;
  onEdit: (assignment: ShiftAssignment) => void;
}

export function ShiftAssignmentTable({
  assignments,
  shifts,
  isLoading,
  error,
  canEdit = true,
  onRetry,
  onEdit,
}: ShiftAssignmentTableProps) {
  const [query, setQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState<string>("ALL");

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      const matchesEmployee = matchesName(a.employeeName, query);
      const matchesShift =
        shiftFilter === "ALL" || String(a.shiftId) === shiftFilter;
      return matchesEmployee && matchesShift;
    });
  }, [assignments, query, shiftFilter]);

  const hasFilters = query.trim().length > 0 || shiftFilter !== "ALL";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by employee name…"
            aria-label="Search assignments by employee name"
            disabled={isLoading}
            className={`${CONTROL_CLASS} w-full pl-11 pr-4 disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </div>

        <label className="sr-only" htmlFor="assignment-shift-filter">
          Filter by shift
        </label>
        <select
          id="assignment-shift-filter"
          value={shiftFilter}
          onChange={(event) => setShiftFilter(event.target.value)}
          disabled={isLoading}
          className={`${CONTROL_CLASS} px-3.5 pr-8 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <option value="ALL">All shifts</option>
          {shifts.map((shift) => (
            <option key={shift.shiftId} value={String(shift.shiftId)}>
              {shift.name}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setShiftFilter("ALL");
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-violet-600"
          >
            <X size={15} />
            Clear filters
          </button>
        )}
      </div>

      <div className="glass-card overflow-hidden rounded-3xl">
        {isLoading ? (
          <ReportLoadingState message="Loading shift assignments…" />
        ) : error ? (
          <ReportErrorState message={error} onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <ReportEmptyState
            title={
              hasFilters
                ? "No shift assignments match your filters"
                : "No shift assignments yet"
            }
            message={
              hasFilters
                ? "Try searching for a different employee name or changing shift filter."
                : "Assigned employee shifts will appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3.5 pl-5 pr-4 font-semibold">Employee</th>
                  <th className="py-3.5 pr-4 font-semibold">Assigned Shift</th>
                  <th className="py-3.5 pr-4 font-semibold">Time In</th>
                  <th className="py-3.5 pr-4 font-semibold">Time Out</th>
                  <th className="py-3.5 pr-4 font-semibold">Allowance</th>
                  <th className="py-3.5 pr-4 font-semibold">Start Date</th>
                  <th className="py-3.5 pr-4 font-semibold">End Date</th>
                  <th className="py-3.5 pr-5 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((assignment) => (
                  <tr
                    key={assignment.id}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/70"
                  >
                    <td className="py-3.5 pl-5 pr-4">
                      <div className="font-medium text-slate-900">
                        {assignment.employeeName}
                      </div>
                      <div className="text-xs text-slate-400">
                        #{assignment.employeeId}
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 text-slate-700 font-medium">
                      {assignment.shiftName}
                    </td>
                    <td className="py-3.5 pr-4 text-slate-600 font-mono text-xs">
                      {assignment.timeIn}
                    </td>
                    <td className="py-3.5 pr-4 text-slate-600 font-mono text-xs">
                      {assignment.timeOut}
                    </td>
                    <td className="py-3.5 pr-4 text-slate-600">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {assignment.allowanceMinutes} mins
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 text-slate-600 whitespace-nowrap">
                      {formatLongDate(assignment.startDate)}
                    </td>
                    <td className="py-3.5 pr-4 text-slate-600 whitespace-nowrap">
                      {assignment.endDate ? (
                        formatLongDate(assignment.endDate)
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100">
                          Ongoing
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 pr-5 text-right">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(assignment)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100/70"
                        >
                          <Edit2 size={13} />
                          Edit
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
