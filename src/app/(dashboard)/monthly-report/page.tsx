"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CalendarClock,
  CircleCheck,
  Clock,
  TriangleExclamationPoint,
} from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { StatCard } from "@/components/attendance/shared/StatCard";
import { ReportErrorState } from "@/components/attendance/shared/ReportStates";
import { MonthlyReportFilters } from "@/components/attendance/reports/ReportFilters";
import { MonthlyAttendanceTable } from "@/components/attendance/reports/MonthlyAttendanceTable";
import { useMonthlyAttendance } from "@/hooks/attendance/useMonthlyAttendance";
import {
  currentLocalMonth,
  formatDuration,
} from "@/lib/attendance/attendance.utils";

interface MonthlyTotals {
  requiredMinutes: number;
  actualMinutes: number;
  missingMinutes: number;
  lateDays: number;
  reviewDays: number;
}

/**
 * Monthly attendance report.
 *
 * Totals are simple sums of the values returned by the backend for each
 * employee - no attendance formula is reimplemented on the client, and
 * review-day minutes stay separate from actual/missing hours.
 */
export default function MonthlyReportPage() {
  const [month, setMonth] = useState(() => currentLocalMonth());
  const { data, isLoading, error, refetch } = useMonthlyAttendance(month);

  const rows = useMemo(() => data?.employees ?? [], [data]);

  const totals = useMemo<MonthlyTotals>(
    () =>
      rows.reduce<MonthlyTotals>(
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
    <>
      <DashboardHeader
        title="Monthly Attendance"
        description="Aggregated attendance totals for every active employee."
        breadcrumbs={[{ label: "Monthly Report" }]}
      />

      {error ? (
        <div className="glass-card rounded-3xl">
          <ReportErrorState message={error} onRetry={refetch} />
        </div>
      ) : (
        <>
          <section
            aria-label="Monthly attendance summary"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <StatCard
              label="Required Hours"
              value={formatDuration(totals.requiredMinutes)}
              icon={Clock}
              tone="sky"
              isLoading={isLoading}
            />
            <StatCard
              label="Actual Hours"
              value={formatDuration(totals.actualMinutes)}
              icon={CircleCheck}
              tone="emerald"
              isLoading={isLoading}
            />
            <StatCard
              label="Discount Hours"
              value={formatDuration(totals.missingMinutes)}
              icon={TriangleExclamationPoint}
              tone="rose"
              isLoading={isLoading}
            />
            <StatCard
              label="Late Days"
              value={totals.lateDays}
              icon={CalendarClock}
              tone="amber"
              isLoading={isLoading}
            />
            <StatCard
              label="Review Days"
              value={totals.reviewDays}
              icon={Activity}
              tone="violet"
              hint="Excluded from hours"
              isLoading={isLoading}
            />
          </section>

          <MonthlyAttendanceTable
            rows={rows}
            isLoading={isLoading}
            controls={
              <MonthlyReportFilters
                month={month}
                onMonthChange={setMonth}
                isRefreshing={isLoading}
                onRefresh={refetch}
              />
            }
          />
        </>
      )}
    </>
  );
}
