"use client";

import { useEffect, useId, useState } from "react";
import { CalendarPlus, LoaderCircle, TriangleExclamationPoint } from "lucide-react";
import type { Employee } from "@/types/attendance/employee.types";
import {
  LEAVE_TYPE_LABELS,
  type CreateLeaveRequest,
  type LeaveTypeValue,
} from "@/types/attendance/leave.types";
import { DATE_INPUT_CLASS } from "@/components/attendance/reports/ReportFilters";

interface LeaveFormDialogProps {
  open: boolean;
  /** Employees offered in the picker. */
  employees: Employee[];
  isPending: boolean;
  /** Validation or server error shown inside the dialog. */
  error: string | null;
  /**
   * Optional starting values for the employee and date range. Used by the Daily
   * Report "Add Leave" action to prefill the employee and the reported day. The
   * body is remounted on every open, so these seed a fresh form each time.
   */
  initialValues?: {
    employeeId?: number;
    dateFrom?: string;
    dateTo?: string;
  };
  onCancel: () => void;
  /** Receives a fully validated request; `createdById` is never sent. */
  onSubmit: (input: CreateLeaveRequest) => void;
}

const FIELD_CLASS =
  "mt-1.5 w-full rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-violet-300";

const LEAVE_TYPE_OPTIONS: readonly LeaveTypeValue[] = [
  "VACATION",
  "SICK_LEAVE",
  "UNPAID",
];

/**
 * Collects a new leave request.
 *
 * The body is mounted only while open, so every open starts with a clean form
 * and no state-resetting effect is needed. The submit button stays disabled
 * until the employee, both dates and the range are valid, and while a request
 * is in flight, so a duplicate submission cannot be triggered.
 */
export function LeaveFormDialog({ open, ...props }: LeaveFormDialogProps) {
  if (!open) return null;

  return <LeaveFormDialogBody {...props} />;
}

type LeaveFormDialogBodyProps = Omit<LeaveFormDialogProps, "open">;

function LeaveFormDialogBody({
  employees,
  isPending,
  error,
  initialValues,
  onCancel,
  onSubmit,
}: LeaveFormDialogBodyProps) {
  const [employeeId, setEmployeeId] = useState<number | "">(
    initialValues?.employeeId ?? ""
  );
  const [leaveType, setLeaveType] = useState<LeaveTypeValue>("VACATION");
  const [dateFrom, setDateFrom] = useState(initialValues?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initialValues?.dateTo ?? "");
  const [reason, setReason] = useState("");

  const fieldId = useId();

  // Escape closes the dialog, matching the backdrop click.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const rangeInvalid =
    dateFrom.length > 0 && dateTo.length > 0 && dateTo < dateFrom;

  const canSubmit =
    !isPending &&
    employeeId !== "" &&
    dateFrom.length > 0 &&
    dateTo.length > 0 &&
    !rangeInvalid;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add leave"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-5"
      >
        <div className="flex items-center gap-2 text-violet-700">
          <CalendarPlus size={18} />
          <h3 className="text-sm font-semibold text-slate-800">Add leave</h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Record an approved leave. Overlapping active leave for the same
          employee is rejected.
        </p>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;

            onSubmit({
              employeeId: Number(employeeId),
              dateFrom,
              dateTo,
              leaveType,
              reason: reason.trim().length > 0 ? reason.trim() : undefined,
            });
          }}
        >
          <label
            htmlFor={`${fieldId}-employee`}
            className="text-xs font-semibold text-slate-600"
          >
            Employee
          </label>
          <select
            id={`${fieldId}-employee`}
            value={employeeId}
            onChange={(event) =>
              setEmployeeId(
                event.target.value === "" ? "" : Number(event.target.value)
              )
            }
            className={`${FIELD_CLASS} mt-0`}
          >
            <option value="">Select an employee…</option>
            {employees.map((employee) => (
              <option key={employee.employeeId} value={employee.employeeId}>
                {employee.fullName} (#{employee.employeeId})
              </option>
            ))}
          </select>

          <label
            htmlFor={`${fieldId}-type`}
            className="text-xs font-semibold text-slate-600"
          >
            Leave type
          </label>
          <select
            id={`${fieldId}-type`}
            value={leaveType}
            onChange={(event) =>
              setLeaveType(event.target.value as LeaveTypeValue)
            }
            className={`${FIELD_CLASS} mt-0`}
          >
            {LEAVE_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {LEAVE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-semibold text-slate-600">
              Start date
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className={DATE_INPUT_CLASS}
              />
            </label>

            <label className="flex flex-col text-xs font-semibold text-slate-600">
              End date
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className={DATE_INPUT_CLASS}
              />
            </label>
          </div>

          {rangeInvalid && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
              <TriangleExclamationPoint size={13} />
              The end date cannot be before the start date.
            </p>
          )}

          <label
            htmlFor={`${fieldId}-reason`}
            className="text-xs font-semibold text-slate-600"
          >
            Reason (optional)
          </label>
          <textarea
            id={`${fieldId}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Optional note about this leave"
            className={`${FIELD_CLASS} mt-0 placeholder:text-slate-400`}
          />

          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600"
            >
              <TriangleExclamationPoint size={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending && <LoaderCircle size={14} className="animate-spin" />}
              Add leave
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
