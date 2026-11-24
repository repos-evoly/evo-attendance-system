"use client";

import { useMemo, useState } from "react";
import { CalendarRange, TriangleExclamationPoint } from "lucide-react";
import type { AttendanceStatus } from "@/types/attendance/daily-attendance.types";
import type { MonthlyAttendanceDay } from "@/types/attendance/monthly-attendance.types";
import { AttendanceStatusBadge } from "@/components/attendance/shared/AttendanceStatusBadge";
import { AttendanceWaiverControl } from "@/components/attendance/shared/AttendanceWaiverControl";
import { WaiverReasonDialog } from "@/components/attendance/shared/WaiverReasonDialog";
import { ConfirmDialog } from "@/components/attendance/shared/ConfirmDialog";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";
import { useAttendanceWaiver } from "@/hooks/attendance/useAttendanceWaiver";
import {
  canToggleWaiver,
  formatDuration,
  formatLongDate,
  formatMonthLabel,
  getLeaveTypeLabel,
  todayLocalDate,
} from "@/lib/attendance/attendance.utils";

type DayFilter = "all" | "late" | "review" | "absent" | "leave";

const FILTERS: readonly { key: DayFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "late", label: "Late" },
  { key: "review", label: "Review" },
  { key: "absent", label: "Absent" },
  { key: "leave", label: "Leaves" },
];

/**
 * Review days are the working days with incomplete punches, exactly as the
 * backend defines them (MISSING_IN / MISSING_OUT). Leaves are the active leave
 * days the backend reported as LEAVE; a cancelled leave is never one.
 */
function matchesFilter(day: MonthlyAttendanceDay, filter: DayFilter): boolean {
  switch (filter) {
    case "late":
      return day.status === "LATE";
    case "review":
      return day.status === "MISSING_IN" || day.status === "MISSING_OUT";
    case "absent":
      return day.status === "ABSENT";
    case "leave":
      return day.status === "LEAVE";
    default:
      return true;
  }
}

/** Subtle row tint for the days a manager usually needs to look at. */
const ROW_TINT: Partial<Record<AttendanceStatus, string>> = {
  LATE: "bg-orange-50/50 hover:bg-orange-50",
  ABSENT: "bg-rose-50/50 hover:bg-rose-50",
  MISSING_OUT: "bg-violet-50/50 hover:bg-violet-50",
  LEAVE: "bg-sky-50/50 hover:bg-sky-50",
};

interface EmployeeMonthlyAttendanceTableProps {
  employeeId: number;
  /** Selected month (`YYYY-MM`). */
  month: string;
  /** Per-day rows returned by the monthly API; null while unavailable. */
  days: MonthlyAttendanceDay[] | null;
  isLoading: boolean;
  error: string | null;
  /** Reloads the month after a waiver change, refreshing records and stats. */
  onRefetch: () => void;
}

/**
 * Monthly attendance view for one employee.
 *
 * Every calendar day returned by the monthly API can be listed (weekends,
 * future dates and all statuses included). Weekends are hidden by default and
 * can be revealed with the toggle; the chips narrow the list to late, review,
 * absent or leave days. A leave day names its concrete leave type instead of a
 * generic leave label. Managers can enable or revoke the stored waiver on eligible
 * days; the toggle only flips `attendance.waiver` through the existing endpoint
 * and never touches device punches.
 *
 * Waiver actions are withheld on future dates and on IN_PROGRESS / PENDING /
 * WEEKEND / NO_SHIFT days by the shared `canToggleWaiver` rule.
 */
export function EmployeeMonthlyAttendanceTable({
  employeeId,
  month,
  days,
  isLoading,
  error,
  onRefetch,
}: EmployeeMonthlyAttendanceTableProps) {
  const { setWaiver, isPending, error: waiverError } = useAttendanceWaiver();
  const [filter, setFilter] = useState<DayFilter>("all");
  const [showWeekends, setShowWeekends] = useState(false);
  // Day whose waiver is being granted; the dialog collects the reason.
  const [reasonTarget, setReasonTarget] = useState<{
    date: string;
    fullName: string;
  } | null>(null);
  // Day whose waiver is being revoked; revoking asks for confirmation.
  const [revokeTarget, setRevokeTarget] = useState<{
    date: string;
    fullName: string;
  } | null>(null);

  const today = todayLocalDate();
  const hasDays = days !== null && days.length > 0;

  const handleToggleWaiver = (day: MonthlyAttendanceDay, nextWaiver: boolean) => {
    // Granting needs a reason, so route it through the dialog.
    if (nextWaiver) {
      setReasonTarget({ date: day.date, fullName: day.fullName });
      return;
    }

    // Revoking changes the reported attendance, so confirm it first.
    setRevokeTarget({ date: day.date, fullName: day.fullName });
  };

  const visibleDays = useMemo(() => {
    if (!days) return [];

    return days.filter(
      (day) =>
        (showWeekends || day.status !== "WEEKEND") && matchesFilter(day, filter)
    );
  }, [days, filter, showWeekends]);

  return (
    <section className="glass-card flex w-full flex-col gap-4 rounded-3xl p-4 md:p-5">
      <div>
        <div className="flex items-center gap-2 text-slate-700">
          <CalendarRange size={18} />
          <h3 className="text-sm font-semibold">Monthly attendance</h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Every day of {formatMonthLabel(month)} for this employee. Enable or
          revoke a waiver on eligible late or incomplete days.
        </p>
      </div>

      {waiverError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600"
        >
          <TriangleExclamationPoint size={14} />
          {waiverError}
        </div>
      )}

      {!isLoading && !error && hasDays && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Filter days"
            className="flex flex-wrap items-center gap-2"
          >
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                aria-pressed={filter === item.key}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors ${
                  filter === item.key
                    ? "bg-violet-600 text-white ring-violet-600"
                    : "bg-white/70 text-slate-600 ring-slate-200 hover:text-violet-600"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={showWeekends}
              onChange={(event) => setShowWeekends(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-violet-600"
            />
            Show weekends
          </label>
        </div>
      )}

      <div>
        {isLoading ? (
          <ReportLoadingState message="Loading monthly attendance…" />
        ) : error ? (
          <ReportErrorState message={error} onRetry={onRefetch} />
        ) : !hasDays ? (
          <ReportEmptyState
            icon={<CalendarRange size={22} />}
            title="No attendance for this month"
            message={`No attendance records were found for ${formatMonthLabel(
              month
            )}.`}
          />
        ) : visibleDays.length === 0 ? (
          <ReportEmptyState
            icon={<CalendarRange size={22} />}
            title="No days match the current filters"
            message="Try another filter, or show weekends to see every day."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pl-4 pr-3 font-semibold">Date</th>
                  <th className="py-3 pr-3 font-semibold">Status</th>
                  <th className="py-3 pr-3 font-semibold">Check-in</th>
                  <th className="py-3 pr-3 font-semibold">Check-out</th>
                  <th className="py-3 pr-3 font-semibold">Required</th>
                  <th className="py-3 pr-3 font-semibold">Actual</th>
                  <th className="py-3 pr-3 font-semibold">Discount Hours</th>
                  <th className="py-3 pr-4 font-semibold">Action</th>
                </tr>
              </thead>

              <tbody>
                {visibleDays.map((day) => (
                  <tr
                    key={day.date}
                    className={`border-b border-slate-100 transition-colors last:border-0 ${
                      ROW_TINT[day.status] ?? "hover:bg-slate-50/70"
                    }`}
                  >
                    <td className="py-3 pl-4 pr-3 whitespace-nowrap text-slate-600">
                      {formatLongDate(day.date)}
                    </td>
                    <td className="py-3 pr-3">
                      <AttendanceStatusBadge
                        status={day.status}
                        label={
                          day.status === "LEAVE" && day.leave
                            ? getLeaveTypeLabel(day.leave.leaveType)
                            : undefined
                        }
                      />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap text-slate-600">
                      {day.checkIn ?? "—"}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap text-slate-600">
                      {day.checkOut ?? "—"}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap text-slate-600">
                      {day.status === "WEEKEND" ||
                      (day.status === "LEAVE" && !day.requiredMinutes)
                        ? "—"
                        : formatDuration(day.requiredMinutes)}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap text-slate-600">
                      {formatDuration(day.actualMinutes)}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap text-slate-600">
                      {formatDuration(day.missingMinutes)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {day.date <= today && canToggleWaiver(day) ? (
                        <AttendanceWaiverControl
                          status={day.status}
                          waiver={day.waiver}
                          isPending={isPending(employeeId, day.date)}
                          onToggle={(nextWaiver) =>
                            handleToggleWaiver(day, nextWaiver)
                          }
                        />
                      ) : (
                        <span className="text-slate-300" aria-hidden>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <WaiverReasonDialog
        open={reasonTarget !== null}
        isPending={
          reasonTarget ? isPending(employeeId, reasonTarget.date) : false
        }
        employeeName={reasonTarget?.fullName ?? ""}
        dateLabel={reasonTarget ? formatLongDate(reasonTarget.date) : ""}
        onCancel={() => setReasonTarget(null)}
        onSubmit={(reason) => {
          if (!reasonTarget) return;

          setWaiver(
            {
              employeeId,
              date: reasonTarget.date,
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
        message={`${revokeTarget?.fullName ?? "This employee"} · ${
          revokeTarget ? formatLongDate(revokeTarget.date) : ""
        }. The day is recalculated from the original device punches.`}
        confirmLabel="Revoke waiver"
        isPending={
          revokeTarget ? isPending(employeeId, revokeTarget.date) : false
        }
        reasonLabel="Revocation reason"
        reasonPlaceholder="Why is this waiver being revoked?"
        onCancel={() => setRevokeTarget(null)}
        onConfirm={(reason) => {
          if (!revokeTarget) return;

          setWaiver(
            {
              employeeId,
              date: revokeTarget.date,
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
    </section>
  );
}
