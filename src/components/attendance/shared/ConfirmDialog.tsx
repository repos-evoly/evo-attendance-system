"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, TriangleExclamationPoint } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Short sentence describing what the action does. */
  message: string;
  /** Label of the confirming button, e.g. "Revoke waiver". */
  confirmLabel: string;
  isPending: boolean;
  /** `danger` paints the confirm action red; `primary` keeps the purple accent. */
  tone?: "danger" | "primary";
  /** Server error from a failed attempt, shown inside the dialog. */
  error?: string | null;
  /**
   * When set, a reason textarea is rendered. `reasonRequired` keeps the confirm
   * button disabled until a non-empty reason is typed.
   */
  reasonLabel?: string;
  reasonRequired?: boolean;
  reasonPlaceholder?: string;
  onCancel: () => void;
  /** Receives the trimmed reason ("", when no reason field is shown). */
  onConfirm: (reason: string) => void;
}

/**
 * Shared confirmation dialog for destructive or auditable actions (cancelling a
 * leave, revoking a waiver).
 *
 * The body is mounted only while open, so each open starts clean and no
 * state-resetting effect is needed. The confirm button is disabled while a
 * request is in flight and, when `reasonRequired`, until a reason is entered -
 * so a duplicate or invalid submission cannot be triggered.
 */
export function ConfirmDialog({ open, ...props }: ConfirmDialogProps) {
  if (!open) return null;

  return <ConfirmDialogBody {...props} />;
}

type ConfirmDialogBodyProps = Omit<ConfirmDialogProps, "open">;

function ConfirmDialogBody({
  title,
  message,
  confirmLabel,
  isPending,
  tone = "primary",
  error,
  reasonLabel,
  reasonRequired = false,
  reasonPlaceholder,
  onCancel,
  onConfirm,
}: ConfirmDialogBodyProps) {
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
  const canConfirm = !isPending && (!reasonRequired || trimmed.length > 0);

  const confirmClass =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-violet-600 hover:bg-violet-700";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card w-full max-w-md rounded-3xl p-5"
      >
        <div
          className={`flex items-center gap-2 ${
            tone === "danger" ? "text-rose-600" : "text-violet-700"
          }`}
        >
          <TriangleExclamationPoint size={18} />
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{message}</p>

        {reasonLabel && (
          <>
            <label
              htmlFor={fieldId}
              className="mt-4 block text-xs font-semibold text-slate-600"
            >
              {reasonLabel}
              {reasonRequired ? "" : " (optional)"}
            </label>
            <textarea
              id={fieldId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              autoFocus
              maxLength={500}
              placeholder={reasonPlaceholder}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300"
            />
          </>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600"
          >
            <TriangleExclamationPoint size={14} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Keep as is
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(trimmed)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {isPending && <LoaderCircle size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
