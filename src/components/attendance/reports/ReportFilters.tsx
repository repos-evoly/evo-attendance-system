"use client";

import { RefreshCw } from "lucide-react";

interface FilterControlProps {
  /** Disables the refresh button while a request is in flight. */
  isRefreshing: boolean;
  onRefresh: () => void;
}

const REFRESH_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60";

/** Shared so the employee details month picker matches the report filters. */
export const DATE_INPUT_CLASS =
  "rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-violet-300";

function RefreshButton({ isRefreshing, onRefresh }: FilterControlProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      className={REFRESH_BUTTON_CLASS}
    >
      <RefreshCw size={16} className={isRefreshing ? "animate-spin" : undefined} />
      Refresh
    </button>
  );
}

/**
 * Date picker + refresh for the Daily report. The chosen date is sent to the
 * existing daily API by the page's hook.
 */
export function DailyReportFilters({
  date,
  onDateChange,
  isRefreshing,
  onRefresh,
}: {
  date: string;
  onDateChange: (value: string) => void;
} & FilterControlProps) {
  return (
    <div className="glass-card flex flex-wrap items-end gap-3 rounded-3xl p-4 md:p-5">
      <label
        htmlFor="daily-report-date"
        className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"
      >
        Date
        <input
          id="daily-report-date"
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) onDateChange(event.target.value);
          }}
          className={DATE_INPUT_CLASS}
        />
      </label>

      <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
    </div>
  );
}

/**
 * Month picker + refresh for the Monthly report.
 */
export function MonthlyReportFilters({
  month,
  onMonthChange,
  isRefreshing,
  onRefresh,
}: {
  month: string;
  onMonthChange: (value: string) => void;
} & FilterControlProps) {
  return (
    <div className="glass-card flex flex-wrap items-end gap-3 rounded-3xl p-4 md:p-5">
      <label
        htmlFor="monthly-report-month"
        className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"
      >
        Month
        <input
          id="monthly-report-month"
          type="month"
          value={month}
          onChange={(event) => {
            if (event.target.value) onMonthChange(event.target.value);
          }}
          className={DATE_INPUT_CLASS}
        />
      </label>

      <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
    </div>
  );
}
