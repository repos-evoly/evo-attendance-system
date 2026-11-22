"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  WAIVER_STATUS_LABELS,
  getWaiverStatus,
  type WaiverRecord,
  type WaiverStatusValue,
} from "@/types/attendance/waiver.types";
import {
  formatDateTime,
  formatLongDate,
  matchesName,
} from "@/lib/attendance/attendance.utils";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";

type StatusFilter = WaiverStatusValue | "ALL";

const STATUS_OPTIONS: readonly StatusFilter[] = ["ALL", "ACTIVE", "REVOKED"];

const CONTROL_CLASS =
  "glass-card rounded-2xl py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300";

interface WaiverTableProps {
  waivers: WaiverRecord[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

/** A missing audit value is shown as the shared placeholder, never invented. */
function orPlaceholder(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "—";
}

/**
 * Read-only waiver table for the Waivers page.
 *
 * Search and the status filter run client-side over the already-fetched list,
 * so no extra requests are made. Both active and revoked waivers are shown with
 * their full grant and revocation audit trail; granting and revoking stay in
 * the Daily Report.
 */
export function WaiverTable({ waivers, isLoading, error, onRetry }: WaiverTableProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const filtered = useMemo(
    () =>
      waivers.filter(
        (waiver) =>
          matchesName(waiver.employeeName, query) &&
          (status === "ALL" || getWaiverStatus(waiver) === status)
      ),
    [waivers, query, status]
  );

  const hasFilters = query.trim().length > 0 || status !== "ALL";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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
            aria-label="Search waivers by employee name"
            disabled={isLoading}
            className={`${CONTROL_CLASS} w-full pl-11 pr-4 disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </div>

        <label className="sr-only" htmlFor="waiver-status-filter">
          Filter by status
        </label>
        <select
          id="waiver-status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          disabled={isLoading}
          className={`${CONTROL_CLASS} px-3.5 pr-8 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? "All statuses" : WAIVER_STATUS_LABELS[option]}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("ALL");
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-violet-600"
          >
            <X size={15} />
            Clear filters
          </button>
        )}
      </div>

      <div className="glass-card overflow-hidden rounded-3xl">
        {isLoading ? (
          <ReportLoadingState message="Loading waiver records…" />
        ) : error ? (
          <ReportErrorState message={error} onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <ReportEmptyState
            title={hasFilters ? "No waivers match your filters" : "No waiver records yet"}
            message={
              hasFilters
                ? "Try a different name or status filter."
                : "Waivers granted from the Daily Report will appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3.5 pl-5 pr-4 font-semibold">Employee</th>
                  <th className="py-3.5 pr-4 font-semibold">Waiver date</th>
                  <th className="py-3.5 pr-4 font-semibold">Status</th>
                  <th className="hidden py-3.5 pr-4 font-semibold xl:table-cell">
                    Reason
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold lg:table-cell">
                    Granted by
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold lg:table-cell">
                    Granted at
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold 2xl:table-cell">
                    Revoked by
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold 2xl:table-cell">
                    Revoked at
                  </th>
                  <th className="hidden py-3.5 pr-5 font-semibold 2xl:table-cell">
                    Revocation reason
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((waiver) => (
                  <tr
                    key={waiver.waiverId}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/70"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <div className="font-medium text-slate-900">
                        {waiver.employeeName}
                      </div>
                      <div className="text-xs text-slate-400">
                        #{waiver.employeeId}
                      </div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                      {formatLongDate(waiver.waiverDate)}
                    </td>
                    <td className="py-3 pr-4">
                      <WaiverStatusBadge status={getWaiverStatus(waiver)} />
                    </td>
                    <td className="hidden max-w-[16rem] py-3 pr-4 xl:table-cell">
                      <span className="block truncate text-slate-600">
                        {orPlaceholder(waiver.reason)}
                      </span>
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap text-slate-600 lg:table-cell">
                      {waiver.waivedByName}
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap text-slate-600 lg:table-cell">
                      {formatDateTime(waiver.createdAt)}
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap text-slate-600 2xl:table-cell">
                      {orPlaceholder(waiver.revokedByName)}
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap text-slate-600 2xl:table-cell">
                      {waiver.revokedAt ? formatDateTime(waiver.revokedAt) : "—"}
                    </td>
                    <td className="hidden max-w-[16rem] py-3 pr-5 2xl:table-cell">
                      <span className="block truncate text-slate-600">
                        {orPlaceholder(waiver.revocationReason)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function WaiverStatusBadge({ status }: { status: WaiverStatusValue }) {
  const styles =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  const dot = status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {WAIVER_STATUS_LABELS[status]}
    </span>
  );
}
