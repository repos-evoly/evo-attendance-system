"use client";

import { useState } from "react";
import {
  Activity,
  CalendarX,
  CircleCheck,
  CircleX,
  Clock,
  TriangleExclamationPoint,
  Users,
} from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { StatCard } from "@/components/attendance/shared/StatCard";
import { ReportErrorState } from "@/components/attendance/shared/ReportStates";
import { DailyReportFilters } from "@/components/attendance/reports/ReportFilters";
import { DailyAttendanceTable } from "@/components/attendance/reports/DailyAttendanceTable";
import { useDailyAttendance } from "@/hooks/attendance/useDailyAttendance";
import { useCurrentUser } from "@/hooks/attendance/useCurrentUser";
import { todayLocalDate } from "@/lib/attendance/attendance.utils";

/**
 * Daily attendance report. The selected date drives the existing
 * `GET /api/v1/attendance/daily` endpoint; summary counters come straight
 * from the API rather than being recomputed here.
 */
export default function DailyReportPage() {
  const [date, setDate] = useState(() => todayLocalDate());
  const { data, isLoading, error, refetch } = useDailyAttendance(date);
  const { currentUser } = useCurrentUser();

  // Waivers and leaves are managed by ADMIN, HR, and MANAGER; VIEWER is read-only.
  const canManageWaivers =
    currentUser?.role === "ADMIN" ||
    currentUser?.role === "HR" ||
    currentUser?.role === "MANAGER";
  const canManageLeaves = canManageWaivers;

  const summary = data?.summary ?? null;

  return (
    <>
      <DashboardHeader
        title="Daily Attendance"
        description="Review a full day of attendance for every active employee."
        breadcrumbs={[{ label: "Daily Report" }]}
      />

      <DailyReportFilters
        date={date}
        onDateChange={setDate}
        isRefreshing={isLoading}
        onRefresh={refetch}
      />

      {error ? (
        <div className="glass-card rounded-3xl">
          <ReportErrorState message={error} onRetry={refetch} />
        </div>
      ) : (
        <>
          <section
            aria-label="Daily attendance summary"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <StatCard
              label="Total Employees"
              value={summary?.total ?? 0}
              icon={Users}
              tone="violet"
              isLoading={isLoading}
            />
            <StatCard
              label="Attending"
              value={summary?.attending ?? 0}
              icon={CircleCheck}
              tone="emerald"
              isLoading={isLoading}
            />
            <StatCard
              label="Late"
              value={summary?.late ?? 0}
              icon={Clock}
              tone="amber"
              isLoading={isLoading}
            />
            <StatCard
              label="In Progress"
              value={summary?.inProgress ?? 0}
              icon={Activity}
              tone="sky"
              isLoading={isLoading}
            />
            <StatCard
              label="Missing Check-Out"
              value={summary?.missingOut ?? 0}
              icon={CalendarX}
              tone="violet"
              isLoading={isLoading}
            />
            <StatCard
              label="Missing Check-In"
              value={summary?.missingIn ?? 0}
              icon={TriangleExclamationPoint}
              tone="amber"
              isLoading={isLoading}
            />
            <StatCard
              label="Absent"
              value={summary?.absent ?? 0}
              icon={CircleX}
              tone="rose"
              isLoading={isLoading}
            />
          </section>

          <DailyAttendanceTable
            rows={data?.employees ?? []}
            isLoading={isLoading}
            date={date}
            canManageWaivers={canManageWaivers}
            canManageLeaves={canManageLeaves}
            onRefetch={refetch}
          />
        </>
      )}
    </>
  );
}
