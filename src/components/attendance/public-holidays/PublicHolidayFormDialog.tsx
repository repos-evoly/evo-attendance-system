"use client";

import { useEffect, useId, useState } from "react";
import { CalendarPlus, LoaderCircle, TriangleExclamationPoint } from "lucide-react";
import type { PublicHoliday } from "@/types/attendance/public-holiday.types";
import type {
  CreatePublicHolidayRequest,
  UpdatePublicHolidayRequest,
} from "@/types/attendance/public-holiday.types";
import { DATE_INPUT_CLASS } from "@/components/attendance/reports/ReportFilters";

interface PublicHolidayFormDialogProps {
  open: boolean;
  /** If provided, this is an edit dialog; otherwise it's a create dialog. */
  holiday?: PublicHoliday | null;
  isPending: boolean;
  /** Validation or server error shown inside the dialog. */
  error: string | null;
  onCancel: () => void;
  /** Receives a fully validated request. */
  onSubmit: (input: CreatePublicHolidayRequest | UpdatePublicHolidayRequest) => void;
}

const FIELD_CLASS =
  "mt-1.5 w-full rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-violet-300";

/**
 * Collects a new or updated public holiday request.
 *
 * The body is mounted only while open, so every open starts with a clean form
 * and no state-resetting effect is needed. The submit button stays disabled
 * until the name, both dates and the range are valid, and while a request
 * is in flight, so a duplicate submission cannot be triggered.
 */
export function PublicHolidayFormDialog({ open, ...props }: PublicHolidayFormDialogProps) {
  if (!open) return null;

  return <PublicHolidayFormDialogBody {...props} />;
}

type PublicHolidayFormDialogBodyProps = Omit<PublicHolidayFormDialogProps, "open">;

function PublicHolidayFormDialogBody({
  holiday,
  isPending,
  error,
  onCancel,
  onSubmit,
}: PublicHolidayFormDialogBodyProps) {
  const [name, setName] = useState(holiday?.name ?? "");
  const [dateFrom, setDateFrom] = useState(holiday?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(holiday?.dateTo ?? "");
  const [reason, setReason] = useState(holiday?.reason ?? "");

  const fieldId = useId();
  const isEdit = holiday !== null;

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
    name.trim().length > 0 &&
    dateFrom.length > 0 &&
    dateTo.length > 0 &&
    !rangeInvalid;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit public holiday" : "Add public holiday"}
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-5"
      >
        <div className="flex items-center gap-2 text-violet-700">
          <CalendarPlus size={18} />
          <h3 className="text-sm font-semibold text-slate-800">
            {isEdit ? "Edit public holiday" : "Add public holiday"}
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {isEdit
            ? "Update the public holiday details. Overlapping with other holidays is rejected."
            : "Record a new public holiday. Overlapping with existing holidays is rejected."}
        </p>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;

            onSubmit({
              name: name.trim(),
              dateFrom,
              dateTo,
              reason: reason.trim().length > 0 ? reason.trim() : undefined,
            });
          }}
        >
          <label
            htmlFor={`${fieldId}-name`}
            className="text-xs font-semibold text-slate-600"
          >
            Holiday name
          </label>
          <input
            id={`${fieldId}-name`}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g., National Day"
            maxLength={200}
            className={`${FIELD_CLASS} mt-0`}
            required
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-semibold text-slate-600">
              Start date
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className={DATE_INPUT_CLASS}
                required
              />
            </label>

            <label className="flex flex-col text-xs font-semibold text-slate-600">
              End date
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className={DATE_INPUT_CLASS}
                required
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
            placeholder="Optional note about this holiday"
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
              {isEdit ? "Update holiday" : "Add holiday"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
