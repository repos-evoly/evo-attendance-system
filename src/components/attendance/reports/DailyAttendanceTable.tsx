"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarPlus,
  Info,
  LoaderCircle,
  Search,
  ShieldCheck,
  ShieldOff,
  TriangleExclamationPoint,
  X,
} from "lucide-react";
import type {
  AttendanceStatus,
  DailyAttendanceRow,
} from "@/types/attendance/daily-attendance.types";
import {
  canToggleWaiver,
  formatDuration,
  formatLongDate,
  getLeaveTypeLabel,
  getStatusLabel,
  getWorkProgress,
  getWorkProgressLabel,
  matchesName,
} from "@/lib/attendance/attendance.utils";
import { AttendanceStatusBadge } from "@/components/attendance/shared/AttendanceStatusBadge";
import { WaiverReasonDialog } from "@/components/attendance/shared/WaiverReasonDialog";
import { ConfirmDialog } from "@/components/attendance/shared/ConfirmDialog";
import { LeaveDetailsDialog } from "@/components/attendance/leaves/LeaveDetailsDialog";
import { LeaveFormDialog } from "@/components/attendance/leaves/LeaveFormDialog";
import { EmployeeAvatar } from "@/components/attendance/employees/EmployeeAvatar";
import {
  ReportEmptyState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";
import { useAttendanceWaiver } from "@/hooks/attendance/useAttendanceWaiver";
import { useCreateLeave } from "@/hooks/attendance/useLeaves";
import { useEmployees } from "@/hooks/attendance/useEmployees";

type StatusFilter = AttendanceStatus | "ALL";

const STATUS_OPTIONS: readonly StatusFilter[] = [
  "ALL",
  "PRESENT",
  "LATE",
  "IN_PROGRESS",
  "MISSING_OUT",
  "MISSING_IN",
  "ABSENT",
  "LEAVE",
  "PENDING",
  "NO_SHIFT",
  "WEEKEND",
];

interface DailyAttendanceTableProps {
  rows: DailyAttendanceRow[];
  isLoading: boolean;
  /** Date the rows belong to; sent with a waiver mutation. */
  date: string;
  /** Whether the current role can grant/revoke waivers (ADMIN, HR, MANAGER). */
  canManageWaivers?: boolean;
  /** Whether the current role can add leaves (ADMIN, HR, MANAGER). */
  canManageLeaves?: boolean;
  /** Reloads the daily data after a waiver change. */
  onRefetch: () => void;
  /** Period controls (date picker + refresh) rendered before the filters. */
  controls?: ReactNode;
}

const CONTROL_CLASS =
  "glass-card h-11 rounded-2xl text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300";

/**
 * Daily attendance table with client-side name search and status filtering
 * over the already-fetched API result (no extra requests).
 *
 * Managers can enable or revoke the stored waiver for eligible days; the
 * toggle only flips `attendance.waiver` and never touches device punches.
 */
export function DailyAttendanceTable({
  rows,
  isLoading,
  date,
  canManageWaivers = true,
  canManageLeaves = true,
  onRefetch,
  controls,
}: DailyAttendanceTableProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  // Employee whose waiver is being granted; the dialog collects the reason.
  const [reasonTarget, setReasonTarget] = useState<{
    employeeId: number;
    fullName: string;
  } | null>(null);
  // Employee whose waiver is being revoked; revoking asks for confirmation.
  const [revokeTarget, setRevokeTarget] = useState<{
    employeeId: number;
    fullName: string;
  } | null>(null);
  // Row whose covering leave is being inspected.
  const [leaveTarget, setLeaveTarget] = useState<DailyAttendanceRow | null>(null);
  // Employee/day the "Add Leave" action opens the leave form for.
  const [leaveFormTarget, setLeaveFormTarget] = useState<{
    employeeId: number;
    date: string;
  } | null>(null);

  const { setWaiver, isPending, error } = useAttendanceWaiver();
  const { employees, isLoading: isEmployeesLoading, error: employeesError } =
    useEmployees();
  const {
    createLeave,
    isPending: isCreatingLeave,
    error: createLeaveError,
  } = useCreateLeave();

  const handleToggleWaiver = (
    row: DailyAttendanceRow,
    nextWaiver: boolean
  ) => {
    // Granting needs a reason, so route it through the dialog.
    if (nextWaiver) {
      setReasonTarget({ employeeId: row.employeeId, fullName: row.fullName });
      return;
    }

    // Revoking changes the reported attendance, so confirm it first.
    setRevokeTarget({ employeeId: row.employeeId, fullName: row.fullName });
  };

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesName(row.fullName, query) &&
          (status === "ALL" || row.status === status)
      ),
    [rows, query, status]
  );

  const hasFilters = query.trim().length > 0 || status !== "ALL";

  return (
    <section className="flex flex-col gap-4">
      {error && (
        <div
          role="alert"
          className="glass-card flex items-center gap-3 rounded-2xl border-l-4 border-l-rose-400 px-4 py-3"
        >
          <TriangleExclamationPoint size={16} className="text-rose-500" />
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      )}

      <div className="glass-card rounded-3xl">
        <div className="sticky top-4 z-20 flex flex-wrap items-center gap-3 rounded-t-3xl border-b border-slate-200/70 bg-white/70 px-5 py-4 backdrop-blur-xl">
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
              aria-label="Search employees"
              disabled={isLoading}
              className={`${CONTROL_CLASS} w-full pl-11 pr-4 disabled:cursor-not-allowed disabled:opacity-60`}
            />
          </div>

          <label className="sr-only" htmlFor="daily-status-filter">
            Filter by attendance status
          </label>
          <select
            id="daily-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            disabled={isLoading}
            className={`${CONTROL_CLASS} px-3.5 pr-8 disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "ALL" ? "All statuses" : getStatusLabel(option)}
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
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl px-3 text-sm font-medium text-slate-500 transition-colors hover:text-violet-600"
            >
              <X size={15} />
              Clear filters
            </button>
          )}

          <p className="ml-auto text-sm text-slate-500">
            {filtered.length === rows.length
              ? `${rows.length} employees`
              : `${filtered.length} of ${rows.length} employees`}
          </p>

          {controls}
        </div>

        <div className="overflow-hidden rounded-b-3xl">
          {isLoading ? (
            <ReportLoadingState message="Loading daily attendance…" />
          ) : filtered.length === 0 ? (
            <ReportEmptyState
              title={hasFilters ? "No matching employees" : "No attendance for this date"}
              message={
                hasFilters
                  ? "Try a different name or status filter."
                  : "There are no scheduled employees to display for this date."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-3.5 pl-5 pr-4 font-semibold">Employee</th>
                    <th className="hidden py-3.5 pr-4 font-semibold md:table-cell">
                      ID
                    </th>
                    <th className="hidden py-3.5 pr-4 font-semibold xl:table-cell">
                      Shift
                    </th>
                    <th className="py-3.5 pr-4 font-semibold">Check in</th>
                    <th className="py-3.5 pr-4 font-semibold">Check out</th>
                    <th className="hidden py-3.5 pr-4 font-semibold lg:table-cell">
                      Worked
                    </th>
                    <th className="hidden py-3.5 pr-4 font-semibold lg:table-cell">
                      Late
                    </th>
                    <th className="hidden py-3.5 pr-4 font-semibold 2xl:table-cell">
                      Required
                    </th>
                    <th className="hidden py-3.5 pr-4 font-semibold 2xl:table-cell">
                      Actual
                    </th>
                    <th className="py-3.5 pr-4 font-semibold">Discount Hours</th>
                    <th className="py-3.5 pr-4 font-semibold">Status</th>
                    <th className="py-3.5 pr-4 font-semibold">Action</th>
                    <th className="py-3.5 pr-5">
                      <span className="sr-only">Open details</span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((row) => (
                    <DailyRow
                      key={row.employeeId}
                      row={row}
                      isWaiverPending={isPending(row.employeeId, date)}
                      canManageWaivers={canManageWaivers}
                      canManageLeaves={canManageLeaves}
                      onGrantWaiver={() => handleToggleWaiver(row, true)}
                      onRevokeWaiver={() => handleToggleWaiver(row, false)}
                      onAddLeave={() =>
                        setLeaveFormTarget({ employeeId: row.employeeId, date })
                      }
                      onShowLeave={() => setLeaveTarget(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <WaiverReasonDialog
        open={reasonTarget !== null}
        isPending={reasonTarget ? isPending(reasonTarget.employeeId, date) : false}
        employeeName={reasonTarget?.fullName ?? ""}
        dateLabel={formatLongDate(date)}
        onCancel={() => setReasonTarget(null)}
        onSubmit={(reason) => {
          if (!reasonTarget) return;

          setWaiver(
            {
              employeeId: reasonTarget.employeeId,
              date,
              waiver: true,
              reason,
            },
            () => {
              setReasonTarget(null);
              onRefetch();
            }
          );
        }}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        tone="danger"
        title="Revoke this waiver?"
        message={`${revokeTarget?.fullName ?? "This employee"} · ${formatLongDate(
          date
        )}. The day is recalculated from the original device punches.`}
        confirmLabel="Revoke waiver"
        isPending={revokeTarget ? isPending(revokeTarget.employeeId, date) : false}
        reasonLabel="Revocation reason"
        reasonPlaceholder="Why is this waiver being revoked?"
        onCancel={() => setRevokeTarget(null)}
        onConfirm={(reason) => {
          if (!revokeTarget) return;

          setWaiver(
            {
              employeeId: revokeTarget.employeeId,
              date,
              waiver: false,
              reason: reason.length > 0 ? reason : undefined,
            },
            () => {
              setRevokeTarget(null);
              onRefetch();
            }
          );
        }}
      />

      <LeaveDetailsDialog
        open={leaveTarget !== null}
        employeeName={leaveTarget?.fullName ?? ""}
        leaveType={leaveTarget?.leave?.leaveType ?? "VACATION"}
        dateFrom={leaveTarget?.leave?.dateFrom ?? ""}
        dateTo={leaveTarget?.leave?.dateTo ?? ""}
        reason={leaveTarget?.leave?.reason ?? null}
        createdByName={leaveTarget?.leave?.createdByName ?? ""}
        createdAt={leaveTarget?.leave?.createdAt ?? ""}
        onClose={() => setLeaveTarget(null)}
      />

      <LeaveFormDialog
        open={leaveFormTarget !== null}
        employees={employees}
        isPending={isCreatingLeave || isEmployeesLoading}
        error={createLeaveError ?? employeesError}
        initialValues={{
          employeeId: leaveFormTarget?.employeeId,
          dateFrom: leaveFormTarget?.date,
          dateTo: leaveFormTarget?.date,
        }}
        onCancel={() => setLeaveFormTarget(null)}
        onSubmit={(input) => {
          createLeave(input, () => {
            setLeaveFormTarget(null);
            onRefetch();
          });
        }}
      />
    </section>
  );
}

function DailyRow({
  row,
  isWaiverPending,
  canManageWaivers,
  canManageLeaves,
  onGrantWaiver,
  onRevokeWaiver,
  onAddLeave,
  onShowLeave,
}: {
  row: DailyAttendanceRow;
  isWaiverPending: boolean;
  canManageWaivers: boolean;
  canManageLeaves: boolean;
  onGrantWaiver: () => void;
  onRevokeWaiver: () => void;
  onAddLeave: () => void;
  onShowLeave: () => void;
}) {
  const router = useRouter();
  const href = `/employees/${row.employeeId}`;
  const hasLeave = row.status === "LEAVE" && row.leave !== null;
  // Name the concrete leave type ("Vacation", "Sick Leave", "Unpaid Leave")
  // instead of the generic "On Leave" status text.
  const leaveLabel = hasLeave && row.leave
    ? getLeaveTypeLabel(row.leave.leaveType)
    : undefined;

  // Add work progress label for Daily Report display
  // Shows "In Progress" or "Completed" alongside attendance status
  // For IN_PROGRESS status, we need to determine the actual attendance status (PRESENT or LATE)
  // based on lateMinutes, then show the work progress separately
  const workProgress = getWorkProgress(row);
  const progressLabel =
    (row.status === "PRESENT" || row.status === "LATE" || row.status === "IN_PROGRESS")
      ? getWorkProgressLabel(workProgress)
      : undefined;

  // For IN_PROGRESS, derive the attendance status from lateMinutes
  let displayStatus: AttendanceStatus = row.status;
  if (row.status === "IN_PROGRESS") {
    displayStatus = row.lateMinutes > 0 ? "LATE" : "PRESENT";
  }

  return (
    <tr
      onClick={() => router.push(href)}
      className="group cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/70"
    >
      <td className="py-3 pl-5 pr-4">
        <div className="flex items-center gap-3">
          <EmployeeAvatar
            fullName={row.fullName}
            employeeId={row.employeeId}
            size="sm"
          />
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="truncate font-medium text-slate-900 transition-colors hover:text-violet-600"
          >
            {row.fullName}
          </Link>
        </div>
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 md:table-cell">
        #{row.employeeId}
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 xl:table-cell">
        {row.shiftName ?? "—"}
      </td>

      <td className="py-3 pr-4 text-slate-600">{row.checkIn ?? "—"}</td>
      <td className="py-3 pr-4 text-slate-600">{row.checkOut ?? "—"}</td>

      <td className="hidden py-3 pr-4 text-slate-600 lg:table-cell">
        {formatDuration(row.workedMinutes)}
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 lg:table-cell">
        {row.lateMinutes > 0 ? `${row.lateMinutes}m` : "—"}
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 2xl:table-cell">
        {formatDuration(row.requiredMinutes)}
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 2xl:table-cell">
        {formatDuration(row.actualMinutes)}
      </td>

      <td className="py-3 pr-4 text-slate-600">
        {formatDuration(row.missingMinutes)}
      </td>

      <td className="py-3 pr-4">
        {hasLeave ? (
          <button
            type="button"
            title="View leave details"
            aria-label={`View leave details for ${row.fullName}`}
            onClick={(event) => {
              event.stopPropagation();
              onShowLeave();
            }}
            className="rounded-full transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <AttendanceStatusBadge status={row.status} label={leaveLabel} />
          </button>
        ) : (
          <AttendanceStatusBadge status={displayStatus} progressLabel={progressLabel} />
        )}
      </td>

      <td className="py-3 pr-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {canManageWaivers && row.waiver ? (
            <button
              type="button"
              title="Revoke waiver"
              aria-label={`Revoke waiver for ${row.fullName}`}
              disabled={isWaiverPending}
              onClick={(event) => {
                event.stopPropagation();
                onRevokeWaiver();
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isWaiverPending ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <ShieldOff size={13} />
              )}
              Revoke Waiver
            </button>
          ) : (
            canManageWaivers && canToggleWaiver(row) && (
              <button
                type="button"
                title="Grant waiver"
                aria-label={`Grant waiver for ${row.fullName}`}
                disabled={isWaiverPending}
                onClick={(event) => {
                  event.stopPropagation();
                  onGrantWaiver();
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck size={13} />
                Grant Waiver
              </button>
            )
          )}

          {hasLeave ? (
            <button
              type="button"
              title="View leave details"
              aria-label={`View leave details for ${row.fullName}`}
              onClick={(event) => {
                event.stopPropagation();
                onShowLeave();
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              <Info size={13} />
              View Leave
            </button>
          ) : (
            canManageLeaves && (
              <button
                type="button"
                title="Add leave"
                aria-label={`Add leave for ${row.fullName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAddLeave();
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                <CalendarPlus size={13} />
                Add Leave
              </button>
            )
          )}
        </div>
      </td>

      <td className="py-3 pr-5">
        <div className="flex items-center justify-end gap-1.5">
          {hasLeave && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShowLeave();
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50"
            >
              <Info size={13} />
              Details
            </button>
          )}
          <ArrowRight
            size={16}
            aria-hidden
            className="text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500"
          />
        </div>
      </td>
    </tr>
  );
}
