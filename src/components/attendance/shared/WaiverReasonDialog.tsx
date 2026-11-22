"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

interface WaiverReasonDialogProps {
  open: boolean;
  isPending: boolean;
  /** Employee the waiver is being granted to. */
  employeeName: string;
  /** Readable date label for the waived day. */
  dateLabel: string;
  onCancel: () => void;
  /** Receives the trimmed, non-empty reason. */
  onSubmit: (reason: string) => void;
}

/**
 * Collects the mandatory reason for granting a waiver.
 *
 * The API refuses a waiver without a reason, so the confirm action stays
 * disabled until a non-empty reason is typed. Revoking a waiver needs no
 * reason and never opens this dialog.
 */
export function WaiverReasonDialog({ open, ...props }: WaiverReasonDialogProps) {
  // The body is mounted only while open, so it starts with an empty reason on
  // every open without a state-resetting effect.
  if (!open) return null;

  return <WaiverReasonDialogBody {...props} />;
}

type WaiverReasonDialogBodyProps = Omit<WaiverReasonDialogProps, "open">;

function WaiverReasonDialogBody({
  isPending,
  employeeName,
  dateLabel,
  onCancel,
  onSubmit,
}: WaiverReasonDialogBodyProps) {
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

  const trimmed = reason.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Waiver reason"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card w-full max-w-md rounded-3xl p-5"
      >
        <div className="flex items-center gap-2 text-violet-700">
          <ShieldCheck size={18} />
          <h3 className="text-sm font-semibold text-slate-800">
            Grant a waiver
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {employeeName} · {dateLabel}
        </p>

        <label
          htmlFor={fieldId}
          className="mt-4 block text-xs font-semibold text-slate-600"
        >
          Reason (required)
        </label>
        <textarea
          id={fieldId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          autoFocus
          maxLength={500}
          placeholder="Why is this day waived?"
          className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          The reason is stored with the waiver for the audit trail.
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || trimmed.length === 0}
            onClick={() => onSubmit(trimmed)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending && <LoaderCircle size={14} className="animate-spin" />}
            Grant waiver
          </button>
        </div>
      </div>
    </div>
  );
}
