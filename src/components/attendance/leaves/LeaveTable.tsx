"use client";

import { useMemo, useState } from "react";
import { Ban, Eye, Search, X } from "lucide-react";
import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  type EmployeeLeave,
  type LeaveStatusValue,
  type LeaveTypeValue,
} from "@/types/attendance/leave.types";
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
import { useCancelLeave } from "@/hooks/attendance/useLeaves";
import { LeaveDetailsDialog } from "./LeaveDetailsDialog";

type StatusFilter = LeaveStatusValue | "ALL";
type TypeFilter = LeaveTypeValue | "ALL";

const TYPE_OPTIONS: readonly TypeFilter[] = ["ALL", "VACATION", "SICK_LEAVE", "UNPAID"];
const STATUS_OPTIONS: readonly StatusFilter[] = ["ALL", "ACTIVE", "CANCELLED"];

const CONTROL_CLASS =
  "glass-card rounded-2xl py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300";

/** True when a `YYYY-MM-DD` date falls inside the (inclusive) leave period. */
function coversDate(leave: EmployeeLeave, date: string): boolean {
  return date >= leave.dateFrom && date <= leave.dateTo;
}

interface LeaveTableProps {
  leaves: EmployeeLeave[];
  isLoading: boolean;
  error: string | null;
  /** Whether the current role can cancel leaves (ADMIN, HR, MANAGER). */
  canManage?: boolean;
  onRetry: () => void;
  /** Reloads the list after a cancellation so the row shows its new status. */
  onChanged: () => void;
}

/**
 * Leave table for the Leaves page.
 *
 * Search and every filter run client-side over the already-fetched list, so no
 * extra requests are made. Active leaves can be cancelled (never deleted);
 * cancelling asks for a reason and refreshes the list when the server confirms.
 */
export function LeaveTable({
  leaves,
  isLoading,
  error,
  canManage = true,
  onRetry,
  onChanged,
}: LeaveTableProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [date, setDate] = useState("");
  const [detailsTarget, setDetailsTarget] = useState<EmployeeLeave | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EmployeeLeave | null>(null);

  const { cancelLeave, isPending, error: cancelError } = useCancelLeave();

  const filtered = useMemo(
    () =>
      leaves.filter(
        (leave) =>
          matchesName(leave.employeeName, query) &&
          (type === "ALL" || leave.leaveType === type) &&
          (status === "ALL" || leave.status === status) &&
          (date.length === 0 || coversDate(leave, date))
      ),
    [leaves, query, type, status, date]
  );

  const hasFilters =
    query.trim().length > 0 || type !== "ALL" || status !== "ALL" || date.length > 0;

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
            aria-label="Search leaves by employee name"
            disabled={isLoading}
            className={`${CONTROL_CLASS} w-full pl-11 pr-4 disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </div>

        <label className="sr-only" htmlFor="leave-type-filter">
          Filter by leave type
        </label>
        <select
          id="leave-type-filter"
          value={type}
          onChange={(event) => setType(event.target.value as TypeFilter)}
          disabled={isLoading}
          className={`${CONTROL_CLASS} px-3.5 pr-8 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? "All leave types" : LEAVE_TYPE_LABELS[option]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="leave-status-filter">
          Filter by status
        </label>
        <select
          id="leave-status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          disabled={isLoading}
          className={`${CONTROL_CLASS} px-3.5 pr-8 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? "All statuses" : LEAVE_STATUS_LABELS[option]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="leave-date-filter">
          Filter by date
        </label>
        <input
          id="leave-date-filter"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          disabled={isLoading}
          title="Show leaves covering this date"
          className={`${CONTROL_CLASS} px-3.5 disabled:cursor-not-allowed disabled:opacity-60`}
        />

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setType("ALL");
              setStatus("ALL");
              setDate("");
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
          <ReportLoadingState message="Loading leave records…" />
        ) : error ? (
          <ReportErrorState message={error} onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <ReportEmptyState
            title={hasFilters ? "No leaves match your filters" : "No leave records yet"}
            message={
              hasFilters
                ? "Try a different name, leave type, status or date."
                : "Approved leaves added from this page will appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3.5 pl-5 pr-4 font-semibold">Employee</th>
                  <th className="py-3.5 pr-4 font-semibold">Leave type</th>
                  <th className="py-3.5 pr-4 font-semibold">Start date</th>
                  <th className="py-3.5 pr-4 font-semibold">End date</th>
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
                {filtered.map((leave) => (
                  <tr
                    key={leave.leaveId}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/70"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <div className="font-medium text-slate-900">
                        {leave.employeeName}
                      </div>
                      <div className="text-xs text-slate-400">
                        #{leave.employeeId}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {LEAVE_TYPE_LABELS[leave.leaveType]}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                      {formatLongDate(leave.dateFrom)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                      {formatLongDate(leave.dateTo)}
                    </td>
                    <td className="hidden max-w-[16rem] py-3 pr-4 xl:table-cell">
                      <span className="block truncate text-slate-600">
                        {leave.reason && leave.reason.trim().length > 0
                          ? leave.reason
                          : "—"}
                      </span>
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap text-slate-600 lg:table-cell">
                      {leave.createdByName}
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap text-slate-600 lg:table-cell">
                      {formatDateTime(leave.createdAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <LeaveStatusBadge status={leave.status} />
                    </td>
                    <td className="py-3 pr-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailsTarget(leave)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
                        >
                          <Eye size={13} />
                          View
                        </button>

                        {leave.status === "ACTIVE" && canManage && (
                          <button
                            type="button"
                            onClick={() => setCancelTarget(leave)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                          >
                            <Ban size={13} />
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LeaveDetailsDialog
        open={detailsTarget !== null}
        employeeName={detailsTarget?.employeeName ?? ""}
        leaveType={detailsTarget?.leaveType ?? "VACATION"}
        dateFrom={detailsTarget?.dateFrom ?? ""}
        dateTo={detailsTarget?.dateTo ?? ""}
        reason={detailsTarget?.reason ?? null}
        createdByName={detailsTarget?.createdByName ?? ""}
        createdAt={detailsTarget?.createdAt ?? ""}
        status={detailsTarget?.status}
        cancelledByName={detailsTarget?.cancelledByName ?? null}
        cancelledAt={detailsTarget?.cancelledAt ?? null}
        cancellationReason={detailsTarget?.cancellationReason ?? null}
        onClose={() => setDetailsTarget(null)}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        tone="danger"
        title="Cancel this leave?"
        message={`${cancelTarget?.employeeName ?? "This employee"} · ${
          cancelTarget
            ? `${formatLongDate(cancelTarget.dateFrom)} – ${formatLongDate(
                cancelTarget.dateTo
              )}`
            : ""
        }. The record is kept and marked cancelled; it stops affecting attendance.`}
        confirmLabel="Cancel leave"
        isPending={cancelTarget ? isPending(cancelTarget.leaveId) : false}
        error={cancelError}
        reasonLabel="Cancellation reason"
        reasonRequired
        reasonPlaceholder="Why is this leave being cancelled?"
        onCancel={() => setCancelTarget(null)}
        onConfirm={(reason) => {
          if (!cancelTarget) return;

          cancelLeave(cancelTarget.leaveId, reason, () => {
            setCancelTarget(null);
            onChanged();
          });
        }}
      />
    </section>
  );
}

function LeaveStatusBadge({ status }: { status: LeaveStatusValue }) {
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
      {LEAVE_STATUS_LABELS[status]}
    </span>
  );
}
