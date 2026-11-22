"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpDown, ChevronDown, Search } from "lucide-react";
import type { MonthlyAttendanceRow } from "@/types/attendance/monthly-attendance.types";
import {
  formatDuration,
  matchesName,
} from "@/lib/attendance/attendance.utils";
import { EmployeeAvatar } from "@/components/attendance/employees/EmployeeAvatar";
import {
  ReportEmptyState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";

type SortKey = "lateDays" | "reviewDays" | "missingMinutes" | "actualMinutes";
type SortDirection = "asc" | "desc";

const SORT_COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: "lateDays", label: "Late days" },
  { key: "reviewDays", label: "Review days" },
  { key: "missingMinutes", label: "Discount Hours" },
  { key: "actualMinutes", label: "Actual hours" },
];

interface MonthlyAttendanceTableProps {
  rows: MonthlyAttendanceRow[];
  isLoading: boolean;
}

/**
 * Monthly attendance table with client-side name search and sorting.
 *
 * Sorting copies the array first, so the original API result is never mutated.
 */
export function MonthlyAttendanceTable({
  rows,
  isLoading,
}: MonthlyAttendanceTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("missingMinutes");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => matchesName(row.fullName, query));
    const factor = sortDirection === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const difference = a[sortKey] - b[sortKey];

      return difference !== 0
        ? difference * factor
        : a.employeeId - b.employeeId;
    });
  }, [rows, query, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("desc");
  };

  return (
    <section className="flex flex-col gap-4">
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
          aria-label="Search employees"
          disabled={isLoading}
          className="glass-card w-full rounded-2xl py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="glass-card overflow-hidden rounded-3xl">
        {isLoading ? (
          <ReportLoadingState message="Loading monthly attendance…" />
        ) : visibleRows.length === 0 ? (
          <ReportEmptyState
            title={query.trim() ? "No matching employees" : "No data for this month"}
            message={
              query.trim()
                ? "Try a different employee name."
                : "There are no attendance records to display for this month."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3.5 pl-5 pr-4 font-semibold">Employee</th>
                  <th className="hidden py-3.5 pr-4 font-semibold md:table-cell">
                    ID
                  </th>
                  {SORT_COLUMNS.map((column) => (
                    <SortableHeader
                      key={column.key}
                      label={column.label}
                      isActive={sortKey === column.key}
                      direction={sortDirection}
                      onToggle={() => toggleSort(column.key)}
                    />
                  ))}
                  <th className="hidden py-3.5 pr-4 font-semibold xl:table-cell">
                    Required hours
                  </th>
                  <th className="py-3.5 pr-5">
                    <span className="sr-only">Open details</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row) => (
                  <MonthlyRow key={row.employeeId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function SortableHeader({
  label,
  isActive,
  direction,
  onToggle,
}: {
  label: string;
  isActive: boolean;
  direction: SortDirection;
  onToggle: () => void;
}) {
  return (
    <th
      aria-sort={
        isActive ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className="py-3.5 pr-4 font-semibold"
    >
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 transition-colors ${
          isActive ? "text-violet-600" : "text-slate-500 hover:text-violet-500"
        }`}
      >
        {label}
        {isActive ? (
          <ChevronDown
            size={14}
            aria-hidden
            className={direction === "asc" ? "rotate-180" : undefined}
          />
        ) : (
          <ArrowUpDown size={13} aria-hidden className="text-slate-300" />
        )}
      </button>
    </th>
  );
}

function MonthlyRow({ row }: { row: MonthlyAttendanceRow }) {
  const router = useRouter();
  const href = `/employees/${row.employeeId}`;

  return (
    <tr
      onClick={() => router.push(href)}
      className="group cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/70"
    >
      <td className="py-3 pl-5 pr-4">
        <div className="flex items-center gap-3">
          <EmployeeAvatar
            fullName={row.fullName}
            employeeId={row.employeeId}
            size="sm"
          />
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="truncate font-medium text-slate-900 transition-colors hover:text-violet-600"
          >
            {row.fullName}
          </Link>
        </div>
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 md:table-cell">
        #{row.employeeId}
      </td>

      <td className="py-3 pr-4 text-slate-600">{row.lateDays}</td>
      <td className="py-3 pr-4 text-slate-600">{row.reviewDays}</td>
      <td className="py-3 pr-4 text-slate-600">
        {formatDuration(row.missingMinutes)}
      </td>
      <td className="py-3 pr-4 text-slate-600">
        {formatDuration(row.actualMinutes)}
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 xl:table-cell">
        {formatDuration(row.requiredMinutes)}
      </td>

      <td className="py-3 pr-5 text-right">
        <ArrowRight
          size={16}
          aria-hidden
          className="ml-auto text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500"
        />
      </td>
    </tr>
  );
}
