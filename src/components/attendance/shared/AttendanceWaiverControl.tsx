"use client";

import { LoaderCircle, ShieldCheck, ShieldOff } from "lucide-react";
import type { AttendanceStatus } from "@/types/attendance/daily-attendance.types";
import { canToggleWaiver } from "@/lib/attendance/attendance.utils";

interface AttendanceWaiverControlProps {
  status: AttendanceStatus;
  /** Stored waiver flag. True renders the revoke action. */
  waiver: boolean;
  isPending: boolean;
  /** Receives the wanted waiver value (`true` enables, `false` revokes). */
  onToggle: (nextWaiver: boolean) => void;
}

/**
 * Enable / revoke control for the stored `attendance.waiver` flag.
 *
 * Eligibility comes from the shared `canToggleWaiver` rule, so the same days
 * are offered everywhere. Renders a muted dash when the day cannot be waived.
 * The control never changes device punches.
 */
export function AttendanceWaiverControl({
  status,
  waiver,
  isPending,
  onToggle,
}: AttendanceWaiverControlProps) {
  if (!canToggleWaiver({ status, waiver })) {
    return (
      <span className="text-slate-300" aria-hidden>
        —
      </span>
    );
  }

  const label = waiver ? "Revoke waiver" : "Enable waiver";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={isPending}
      onClick={(event) => {
        // The daily table row navigates on click, so keep the toggle local.
        event.stopPropagation();
        onToggle(!waiver);
      }}
      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        waiver
          ? "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200"
          : "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100"
      }`}
    >
      {isPending ? (
        <LoaderCircle size={13} className="animate-spin" />
      ) : waiver ? (
        <ShieldOff size={13} />
      ) : (
        <ShieldCheck size={13} />
      )}
      {waiver ? "Revoke" : "Waive"}
    </button>
  );
}
