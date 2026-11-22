"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import type {
  AttendanceStatus,
  DailyAttendanceRow,
} from "@/types/attendance/daily-attendance.types";
import {
  ATTENTION_NOTES,
  ATTENTION_STATUSES,
  needsAttention,
} from "@/lib/attendance/attendance.utils";
import { AttendanceStatusBadge } from "@/components/attendance/shared/AttendanceStatusBadge";
import { EmployeeAvatar } from "@/components/attendance/employees/EmployeeAvatar";
import {
  ReportEmptyState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";

interface EmployeesRequiringAttentionProps {
  rows: DailyAttendanceRow[];
  isLoading: boolean;
}

function attentionRank(status: AttendanceStatus): number {
  const index = ATTENTION_STATUSES.indexOf(status);

  return index === -1 ? ATTENTION_STATUSES.length : index;
}

/**
 * Employees whose attendance needs a manager's attention.
 *
 * Genuine late arrivals, incomplete days (MISSING_OUT / MISSING_IN), and
 * confirmed absences are listed. Ordinary IN_PROGRESS employees who have
 * checked in but not yet checked out are not included.
 */
export function EmployeesRequiringAttention({
  rows,
  isLoading,
}: EmployeesRequiringAttentionProps) {
  const attention = rows
    .filter((row) => needsAttention(row.status))
    .sort((a, b) => {
      const byStatus = attentionRank(a.status) - attentionRank(b.status);

      return byStatus !== 0
        ? byStatus
        : a.fullName.localeCompare(b.fullName);
    });

  return (
    <section className="glass-card rounded-3xl p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            Requires Attention
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Late arrivals, incomplete days, and confirmed absences.
          </p>
        </div>
        {attention.length > 0 && (
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-100">
            {attention.length} employee{attention.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-4">
        {isLoading ? (
          <ReportLoadingState message="Checking today's attendance…" />
        ) : attention.length === 0 ? (
          <ReportEmptyState
            icon={<CircleCheck size={22} />}
            title="Everyone is on track"
            message="No late arrivals, incomplete days, or absences right now."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {attention.map((row) => (
              <li key={row.employeeId}>
                <Link
                  href={`/employees/${row.employeeId}`}
                  className="group flex items-center gap-3 py-3 transition-colors first:pt-0 last:pb-0"
                >
                  <EmployeeAvatar
                    fullName={row.fullName}
                    employeeId={row.employeeId}
                    size="sm"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 transition-colors group-hover:text-violet-600">
                      {row.fullName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      #{row.employeeId} ·{" "}
                      {ATTENTION_NOTES[row.status] ?? "Needs review"}
                    </p>
                  </div>

                  <div className="hidden text-right sm:block">
                    <p className="text-xs font-medium text-slate-600">
                      {row.checkIn ?? "—"}
                    </p>
                    <p className="text-[11px] text-slate-400">Check-in</p>
                  </div>

                  <AttendanceStatusBadge status={row.status} />

                  <ArrowRight
                    size={16}
                    aria-hidden
                    className="shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
