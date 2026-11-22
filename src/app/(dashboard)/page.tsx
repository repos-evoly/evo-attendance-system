"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  RefreshCw,
  TriangleExclamationPoint,
  Users,
  type LucideIcon,
} from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { DashboardStats } from "@/components/attendance/dashboard/DashboardStats";
import { AttendanceDistributionChart } from "@/components/attendance/dashboard/AttendanceDistributionChart";
import { EmployeesRequiringAttention } from "@/components/attendance/dashboard/EmployeesRequiringAttention";
import { MonthlySnapshot } from "@/components/attendance/dashboard/MonthlySnapshot";
import { PublicHolidayBanner } from "@/components/attendance/dashboard/PublicHolidayBanner";
import {
  SyncRunButton,
  SyncRunFeedback,
} from "@/components/attendance/sync/SyncRunButton";
import { useDailyAttendance } from "@/hooks/attendance/useDailyAttendance";
import { useMonthlyAttendance } from "@/hooks/attendance/useMonthlyAttendance";
import { usePublicHolidays } from "@/hooks/attendance/usePublicHolidays";
import { useSyncStatus } from "@/hooks/attendance/useSyncStatus";
import {
  currentLocalMonth,
  findActiveHolidayForToday,
  formatLongDate,
  todayLocalDate,
} from "@/lib/attendance/attendance.utils";

interface QuickLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const QUICK_LINKS: readonly QuickLink[] = [
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/daily-report", label: "Daily Report", icon: CalendarDays },
  { href: "/monthly-report", label: "Monthly Report", icon: CalendarRange },
];

/**
 * Home overview. Combines the employee directory count with the daily and
 * monthly reports into a single management snapshot.
 */
export default function HomeOverviewPage() {
  const [today] = useState(() => todayLocalDate());
  const [month] = useState(() => currentLocalMonth());

  const daily = useDailyAttendance(today);
  const monthly = useMonthlyAttendance(month);
  const syncStatus = useSyncStatus();
  const publicHolidays = usePublicHolidays();

  const summary = daily.data?.summary ?? null;
  const activeHoliday = findActiveHolidayForToday(publicHolidays.holidays);

  return (
    <>
      <DashboardHeader
        title="Attendance Overview"
        description={`${formatLongDate(today)} · A live snapshot of today's attendance.`}
        actions={<SyncRunButton status={syncStatus} />}
      />

      <SyncRunFeedback feedback={syncStatus.runFeedback} />

      {activeHoliday && <PublicHolidayBanner holiday={activeHoliday} />}

      <nav aria-label="Quick links" className="flex flex-wrap gap-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="glass-card group inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:text-violet-600"
          >
            <link.icon size={16} className="text-violet-500" />
            {link.label}
            <ArrowRight
              size={14}
              aria-hidden
              className="text-slate-300 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        ))}
      </nav>

      {daily.error && (
        <div
          role="alert"
          className="glass-card flex flex-wrap items-center gap-3 rounded-3xl border-l-4 border-l-rose-400 px-5 py-4"
        >
          <TriangleExclamationPoint size={18} className="text-rose-500" />
          <p className="flex-1 text-sm text-slate-600">
            Today&apos;s attendance could not be loaded. {daily.error}
          </p>
          <button
            type="button"
            onClick={daily.refetch}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
          >
            <RefreshCw size={14} />
            Try again
          </button>
        </div>
      )}

      <DashboardStats
        summary={summary}
        isLoading={daily.isLoading}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AttendanceDistributionChart
          summary={summary}
          isLoading={daily.isLoading}
        />
        <MonthlySnapshot
          month={monthly.data?.month ?? month}
          rows={monthly.data?.employees ?? []}
          isLoading={monthly.isLoading}
        />
      </div>

      <EmployeesRequiringAttention
        rows={daily.data?.employees ?? []}
        isLoading={daily.isLoading}
      />
    </>
  );
}
