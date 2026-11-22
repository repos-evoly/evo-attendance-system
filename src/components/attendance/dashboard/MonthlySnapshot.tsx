"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CalendarRange } from "lucide-react";
import type { MonthlyAttendanceRow } from "@/types/attendance/monthly-attendance.types";
import {
  formatDuration,
  formatMonthLabel,
} from "@/lib/attendance/attendance.utils";
import { ReportLoadingState } from "@/components/attendance/shared/ReportStates";

interface MonthlySnapshotProps {
  month: string;
  rows: MonthlyAttendanceRow[];
  isLoading: boolean;
}

interface SnapshotTotals {
  requiredMinutes: number;
  actualMinutes: number;
  missingMinutes: number;
  lateDays: number;
  reviewDays: number;
}

/**
 * Compact monthly summary for the Home page.
 *
 * Totals are summed from the backend rows only: review-day minutes stay
 * separate and are never folded into actual or missing hours.
 */
export function MonthlySnapshot({
  month,
  rows,
  isLoading,
}: MonthlySnapshotProps) {
  const totals = useMemo<SnapshotTotals>(
    () =>
      rows.reduce<SnapshotTotals>(
        (accumulator, row) => ({
          requiredMinutes: accumulator.requiredMinutes + row.requiredMinutes,
          actualMinutes: accumulator.actualMinutes + row.actualMinutes,
          missingMinutes: accumulator.missingMinutes + row.missingMinutes,
          lateDays: accumulator.lateDays + row.lateDays,
          reviewDays: accumulator.reviewDays + row.reviewDays,
        }),
        {
          requiredMinutes: 0,
          actualMinutes: 0,
          missingMinutes: 0,
          lateDays: 0,
          reviewDays: 0,
        }
      ),
    [rows]
  );

  return (
    <section className="glass-card flex flex-col rounded-3xl p-5 md:p-6">
      <div className="flex items-center gap-2 text-violet-700">
        <CalendarRange size={18} />
        <h2 className="text-sm font-semibold text-slate-800">
          Monthly snapshot
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {formatMonthLabel(month)} · all employees combined.
      </p>

      <div className="mt-4 flex-1">
        {isLoading ? (
          <ReportLoadingState message="Loading monthly totals…" />
        ) : (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <SnapshotRow
              label="Total required hours"
              value={formatDuration(totals.requiredMinutes)}
            />
            <SnapshotRow
              label="Total actual hours"
              value={formatDuration(totals.actualMinutes)}
            />
            <SnapshotRow
              label="Total missing hours"
              value={formatDuration(totals.missingMinutes)}
            />
            <SnapshotRow
              label="Total late days"
              value={String(totals.lateDays)}
            />
            <SnapshotRow
              label="Total review days"
              value={String(totals.reviewDays)}
              hint="Excluded from hours"
            />
          </dl>
        )}
      </div>

      <Link
        href="/monthly-report"
        className="group mt-5 inline-flex items-center gap-2 text-xs font-semibold text-violet-600 transition-colors hover:text-violet-700"
      >
        View monthly report
        <ArrowRight
          size={14}
          aria-hidden
          className="transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </section>
  );
}

function SnapshotRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold text-slate-900">{value}</dd>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
