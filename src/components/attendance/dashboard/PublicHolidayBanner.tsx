"use client";

import { Calendar } from "lucide-react";
import type { PublicHoliday } from "@/types/attendance/public-holiday.types";
import { formatLongDate } from "@/lib/attendance/attendance.utils";

interface PublicHolidayBannerProps {
  holiday: PublicHoliday;
}

/**
 * Banner displayed on the Home Dashboard when an active public holiday
 * includes today's Libya date (UTC+02:00).
 *
 * Shows the holiday name, Arabic name when applicable, and date range.
 */
export function PublicHolidayBanner({ holiday }: PublicHolidayBannerProps) {
  const dateRange =
    holiday.dateFrom === holiday.dateTo
      ? formatLongDate(holiday.dateFrom)
      : `${formatLongDate(holiday.dateFrom)} – ${formatLongDate(holiday.dateTo)}`;

  return (
    <div
      role="banner"
      className="glass-card flex flex-wrap items-center gap-4 rounded-3xl border-l-4 border-l-amber-400 bg-amber-50/50 px-5 py-4"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
        <Calendar size={20} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          Public Holiday: {holiday.name}
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          {dateRange}
        </p>
      </div>
    </div>
  );
}
