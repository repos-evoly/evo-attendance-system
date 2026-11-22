"use client";

import { useMemo, useState } from "react";
import { Edit2, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { PublicHoliday } from "@/types/attendance/public-holiday.types";
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
import { ConfirmDialog } from "@/components/attendance/shared/ConfirmDialog";
import {
  useDeletePublicHoliday,
  useReactivatePublicHoliday,
  useUpdatePublicHoliday,
} from "@/hooks/attendance/usePublicHolidays";
import { PublicHolidayFormDialog } from "./PublicHolidayFormDialog";

type StatusFilter = "ALL" | "ACTIVE" | "CANCELLED";

const STATUS_OPTIONS: readonly StatusFilter[] = ["ALL", "ACTIVE", "CANCELLED"];

const CONTROL_CLASS =
  "glass-card rounded-2xl py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300";

/** True when a `YYYY-MM-DD` date falls inside the (inclusive) holiday period. */
function coversDate(holiday: PublicHoliday, date: string): boolean {
  return date >= holiday.dateFrom && date <= holiday.dateTo;
}

interface PublicHolidayTableProps {
  holidays: PublicHoliday[];
  isLoading: boolean;
  error: string | null;
  /** Whether the current role can manage holidays (ADMIN, HR). */
  canManage?: boolean;
  onRetry: () => void;
  /** Reloads the list after an edit or deletion. */
  onChanged: () => void;
}

/**
 * Public holiday table for the Leaves page.
 *
 * Search and date filter run client-side over the already-fetched list, so no
 * extra requests are made. Holidays can be edited or deleted.
 */
export function PublicHolidayTable({
  holidays,
  isLoading,
  error,
  canManage = true,
  onRetry,
  onChanged,
}: PublicHolidayTableProps) {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [editTarget, setEditTarget] = useState<PublicHoliday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicHoliday | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<PublicHoliday | null>(null);

  const { updateHoliday, isPending: isUpdating, error: updateError } = useUpdatePublicHoliday();
  const { deleteHoliday, isPending: isDeleting, error: deleteError } = useDeletePublicHoliday();
  const { reactivateHoliday, isPending: isReactivating, error: reactivateError } = useReactivatePublicHoliday();

  const filtered = useMemo(
    () =>
      holidays.filter((holiday) => {
        const matchesSearch = matchesName(holiday.name, query) && (date.length === 0 || coversDate(holiday, date));
        const matchesStatus =
          status === "ALL" ||
          (status === "ACTIVE" && holiday.cancelledAt === null) ||
          (status === "CANCELLED" && holiday.cancelledAt !== null);
        return matchesSearch && matchesStatus;
      }),
    [holidays, query, date, status]
  );

  const hasFilters = query.trim().length > 0 || date.length > 0 || status !== "ALL";

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
            placeholder="Search by holiday name…"
            aria-label="Search holidays by name"
            disabled={isLoading}
            className={`${CONTROL_CLASS} w-full pl-11 pr-4 disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </div>

        <label className="sr-only" htmlFor="holiday-status-filter">
          Filter by status
        </label>
        <select
          id="holiday-status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          disabled={isLoading}
          className={`${CONTROL_CLASS} px-3.5 pr-8 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? "All statuses" : option === "ACTIVE" ? "Active" : "Cancelled"}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="holiday-date-filter">
          Filter by date
        </label>
        <input
          id="holiday-date-filter"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          disabled={isLoading}
          title="Show holidays covering this date"
          className={`${CONTROL_CLASS} px-3.5 disabled:cursor-not-allowed disabled:opacity-60`}
        />

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setDate("");
              setStatus("ALL");
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-violet-600"
          >
            <X size={15} />
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <ReportLoadingState />
      ) : error ? (
        <ReportErrorState message={error} onRetry={onRetry} />
      ) : filtered.length === 0 ? (
        <ReportEmptyState
          title="No holidays"
          message={
            hasFilters
              ? "No holidays match your filters."
              : "No public holidays recorded yet."
          }
        />
      ) : (
        <div className="glass-card overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3.5 pl-5 pr-4 font-semibold">Name</th>
                  <th className="py-3.5 pr-4 font-semibold">Date Range</th>
                  <th className="hidden py-3.5 pr-4 font-semibold xl:table-cell">
                    Reason
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold lg:table-cell">
                    Created by
                  </th>
                  <th className="hidden py-3.5 pr-4 font-semibold lg:table-cell">
                    Created at
                  </th>
                  <th className="py-3.5 pr-4 font-semibold">Status</th>
                  <th className="py-3.5 pr-5 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((holiday) => (
                  <tr
                    key={holiday.holidayId}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/70"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <div className="font-medium text-slate-900">
                        {holiday.name}
                      </div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                      {formatLongDate(holiday.dateFrom)}
                      {holiday.dateFrom !== holiday.dateTo && (
                        <> – {formatLongDate(holiday.dateTo)}</>
                      )}
                    </td>
                    <td className="hidden max-w-[16rem] py-3 pr-4 xl:table-cell">
                      <span className="block truncate text-slate-600">
                        {holiday.reason && holiday.reason.trim().length > 0
                          ? holiday.reason
                          : "—"}
                      </span>
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap text-slate-600 lg:table-cell">
                      {holiday.createdByName}
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap text-slate-600 lg:table-cell">
                      {formatDateTime(holiday.createdAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <HolidayStatusBadge cancelledAt={holiday.cancelledAt} />
                    </td>
                    <td className="py-3 pr-5">
                      {canManage ? (
                        <div className="flex items-center justify-end gap-2">
                          {holiday.cancelledAt ? (
                            <button
                              type="button"
                              onClick={() => {
                                setReactivateTarget(holiday);
                                setEditTarget(null);
                                setDeleteTarget(null);
                              }}
                              disabled={isReactivating(holiday.holidayId)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={`Reactivate ${holiday.name}`}
                            >
                              <RefreshCw size={13} />
                              Reactivate
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditTarget(holiday);
                                  setDeleteTarget(null);
                                }}
                                disabled={isUpdating(holiday.holidayId)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`Edit ${holiday.name}`}
                              >
                                <Edit2 size={13} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteTarget(holiday);
                                  setEditTarget(null);
                                }}
                                disabled={isDeleting(holiday.holidayId)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`Delete ${holiday.name}`}
                              >
                                <Trash2 size={13} />
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="flex justify-end text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PublicHolidayFormDialog
        open={editTarget !== null}
        holiday={editTarget}
        isPending={isUpdating(editTarget?.holidayId ?? "")}
        error={updateError ?? deleteError}
        onCancel={() => setEditTarget(null)}
        onSubmit={(input) => {
          updateHoliday(editTarget!.holidayId, input, () => {
            setEditTarget(null);
            onChanged();
          });
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title="Cancel this public holiday?"
        message={`${deleteTarget?.name ?? "This holiday"} · ${
          deleteTarget
            ? `${formatLongDate(deleteTarget.dateFrom)}${
                deleteTarget.dateFrom !== deleteTarget.dateTo
                  ? ` – ${formatLongDate(deleteTarget.dateTo)}`
                  : ""
              }`
            : ""
        }. The record is kept and marked cancelled; it stops affecting attendance.`}
        confirmLabel="Cancel holiday"
        isPending={isDeleting(deleteTarget?.holidayId ?? "")}
        error={deleteError}
        reasonLabel="Cancellation reason"
        reasonRequired
        reasonPlaceholder="Why is this holiday being cancelled?"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={(reason) => {
          if (!deleteTarget) return;
          deleteHoliday(deleteTarget.holidayId, reason, () => {
            setDeleteTarget(null);
            onChanged();
          });
        }}
      />

      <ConfirmDialog
        open={reactivateTarget !== null}
        tone="primary"
        title="Reactivate this public holiday?"
        message={`${reactivateTarget?.name ?? "This holiday"} · ${
          reactivateTarget
            ? `${formatLongDate(reactivateTarget.dateFrom)}${
                reactivateTarget.dateFrom !== reactivateTarget.dateTo
                  ? ` – ${formatLongDate(reactivateTarget.dateTo)}`
                  : ""
              }`
            : ""
        }. The holiday will be restored as active and will affect attendance again.`}
        confirmLabel="Reactivate holiday"
        isPending={isReactivating(reactivateTarget?.holidayId ?? "")}
        error={reactivateError}
        onCancel={() => setReactivateTarget(null)}
        onConfirm={() => {
          if (!reactivateTarget) return;
          reactivateHoliday(reactivateTarget.holidayId, () => {
            setReactivateTarget(null);
            onChanged();
          });
        }}
      />
    </section>
  );
}

function HolidayStatusBadge({ cancelledAt }: { cancelledAt: string | null }) {
  const styles =
    cancelledAt === null
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  const dot = cancelledAt === null ? "bg-emerald-500" : "bg-slate-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {cancelledAt === null ? "Active" : "Cancelled"}
    </span>
  );
}
