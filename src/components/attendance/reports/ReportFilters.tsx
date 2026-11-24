"use client";

import { RefreshCw } from "lucide-react";

interface FilterControlProps {
  /** Disables the refresh button while a request is in flight. */
  isRefreshing: boolean;
  onRefresh: () => void;
}

const REFRESH_BUTTON_CLASS =
  "inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60";

/** Shared so the employee details month picker matches the report filters. */
export const DATE_INPUT_CLASS =
  "h-11 rounded-2xl border border-slate-200 bg-white/80 px-3.5 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-violet-300";

function RefreshButton({ isRefreshing, onRefresh }: FilterControlProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      aria-label="Refresh report"
      title="Refresh"
      className={REFRESH_BUTTON_CLASS}
    >
      <RefreshCw size={16} className={isRefreshing ? "animate-spin" : undefined} />
    </button>
  );
}

/**
 * Date picker + refresh for the Daily report, rendered at the start of the
 * table toolbar. The chosen date is sent to the existing daily API
 * by the page's hook.
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
    <>
      <label htmlFor="daily-report-date" className="sr-only">
        Date
      </label>
      <input
        id="daily-report-date"
        type="date"
        value={date}
        onChange={(event) => {
          if (event.target.value) onDateChange(event.target.value);
        }}
        aria-label="Report date"
        className={DATE_INPUT_CLASS}
      />

      <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
    </>
  );
}

/**
 * Month picker + refresh for the Monthly report, rendered at the start of
 * the table toolbar.
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
    <>
      <label htmlFor="monthly-report-month" className="sr-only">
        Month
      </label>
      <input
        id="monthly-report-month"
        type="month"
        value={month}
        onChange={(event) => {
          if (event.target.value) onMonthChange(event.target.value);
        }}
        aria-label="Report month"
        className={DATE_INPUT_CLASS}
      />

      <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
    </>
  );
}
