"use client";

import { useEffect } from "react";
import { CalendarDays, X } from "lucide-react";
import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  type LeaveStatusValue,
  type LeaveTypeValue,
} from "@/types/attendance/leave.types";
import { formatDateTime, formatLongDate } from "@/lib/attendance/attendance.utils";

interface LeaveDetailsDialogProps {
  open: boolean;
  employeeName: string;
  leaveType: LeaveTypeValue;
  dateFrom: string;
  dateTo: string;
  reason: string | null;
  createdByName: string;
  createdAt: string;
  /**
   * Cancellation audit shown when the dialog is opened from the Leaves page.
   * The Daily Report dialog omits these because the day is always ACTIVE.
   */
  status?: LeaveStatusValue;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  onClose: () => void;
}

/**
 * Read-only view of the complete leave information: who created it and when,
 * and - when cancelled - who cancelled it, when and why. Used by the Leaves
 * page and by the Daily Report "On Leave" details action.
 */
export function LeaveDetailsDialog({ open, ...props }: LeaveDetailsDialogProps) {
  if (!open) return null;

  return <LeaveDetailsDialogBody {...props} />;
}

type LeaveDetailsDialogBodyProps = Omit<LeaveDetailsDialogProps, "open">;

const PLACEHOLDER = "—";

function LeaveDetailsDialogBody({
  employeeName,
  leaveType,
  dateFrom,
  dateTo,
  reason,
  createdByName,
  createdAt,
  status,
  cancelledByName,
  cancelledAt,
  cancellationReason,
  onClose,
}: LeaveDetailsDialogBodyProps) {
  // Escape closes the dialog, matching the backdrop click.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const isCancelled = status === "CANCELLED";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leave details"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-violet-700">
            <CalendarDays size={18} />
            <h3 className="text-sm font-semibold text-slate-800">Leave details</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {status && (
          <span
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
              isCancelled
                ? "bg-slate-100 text-slate-600 ring-slate-200"
                : "bg-emerald-50 text-emerald-700 ring-emerald-200"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                isCancelled ? "bg-slate-400" : "bg-emerald-500"
              }`}
            />
            {LEAVE_STATUS_LABELS[status]}
          </span>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Employee" value={employeeName} />
          <Field label="Leave type" value={LEAVE_TYPE_LABELS[leaveType]} />
          <Field label="Start date" value={formatLongDate(dateFrom)} />
          <Field label="End date" value={formatLongDate(dateTo)} />
          <Field label="Created by" value={createdByName} />
          <Field label="Created at" value={formatDateTime(createdAt)} />
          <Field
            label="Reason"
            value={reason && reason.trim().length > 0 ? reason : PLACEHOLDER}
            fullWidth
          />

          {isCancelled && (
            <>
              <Field label="Cancelled by" value={cancelledByName ?? PLACEHOLDER} />
              <Field
                label="Cancelled at"
                value={cancelledAt ? formatDateTime(cancelledAt) : PLACEHOLDER}
              />
              <Field
                label="Cancellation reason"
                value={
                  cancellationReason && cancellationReason.trim().length > 0
                    ? cancellationReason
                    : PLACEHOLDER
                }
                fullWidth
              />
            </>
          )}
        </dl>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">
        {value}
      </dd>
    </div>
  );
}
