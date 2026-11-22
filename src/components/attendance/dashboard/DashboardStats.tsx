"use client";

import { CircleCheck, CircleX, Clock, Users } from "lucide-react";
import type { DailyAttendanceSummary } from "@/types/attendance/daily-attendance.types";
import { StatCard } from "@/components/attendance/shared/StatCard";

interface DashboardStatsProps {
  /** Backend-computed counters from `GET /api/v1/attendance/daily`. */
  summary: DailyAttendanceSummary | null;
  isLoading: boolean;
}

/**
 * Today's four headline metrics.
 *
 * Attending / Late / Absent / On Leave come straight from the daily API summary - the
 * frontend never re-derives attendance statuses.
 */
export function DashboardStats({
  summary,
  isLoading,
}: DashboardStatsProps) {
  return (
    <section
      aria-label="Today's attendance statistics"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
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
        label="Absent"
        value={summary?.absent ?? 0}
        icon={CircleX}
        tone="rose"
        isLoading={isLoading}
      />
      <StatCard
        label="On Leave"
        value={summary?.onLeave ?? 0}
        icon={Users}
        tone="violet"
        isLoading={isLoading}
      />
    </section>
  );
}
