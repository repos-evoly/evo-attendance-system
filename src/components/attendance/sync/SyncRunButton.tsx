"use client";

import {
  CircleCheck,
  RefreshCw,
  TriangleExclamationPoint,
} from "lucide-react";
import type {
  RunSyncFeedback as RunSyncFeedbackState,
  RunSyncOutcome,
  UseSyncStatusResult,
} from "@/hooks/attendance/useSyncStatus";

/** Tone of the feedback strip shown after a Run Sync attempt. */
const RUN_FEEDBACK_CLASSES: Record<RunSyncOutcome, string> = {
  completed: "border-emerald-100 bg-emerald-50/60 text-emerald-700",
  "already-running": "border-amber-100 bg-amber-50/60 text-amber-700",
  failed: "border-rose-100 bg-rose-50/60 text-rose-700",
};

interface SyncRunButtonProps {
  /** Shared `useSyncStatus` result; the button only asks the server to start. */
  status: UseSyncStatusResult;
}

/**
 * Starts the Sync Service through `POST /api/v1/sync/run`.
 *
 * Loading state, duplicate-click protection and the resulting feedback all
 * live in `useSyncStatus`, so the same control can be dropped on any page.
 */
export function SyncRunButton({ status }: SyncRunButtonProps) {
  return (
    <button
      type="button"
      onClick={status.runSync}
      disabled={status.isRunning}
      className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RefreshCw
        size={16}
        className={status.isRunning ? "animate-spin" : undefined}
      />
      {status.isRunning ? "Syncing…" : "Run Sync"}
    </button>
  );
}

interface SyncRunFeedbackProps {
  feedback: RunSyncFeedbackState | null;
  className?: string;
}

/** Outcome strip for the last Run Sync attempt; renders nothing when idle. */
export function SyncRunFeedback({ feedback, className }: SyncRunFeedbackProps) {
  if (!feedback) return null;

  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs ${
        RUN_FEEDBACK_CLASSES[feedback.outcome]
      } ${className ?? ""}`}
    >
      {feedback.outcome === "completed" ? (
        <CircleCheck size={16} className="mt-px shrink-0" />
      ) : (
        <TriangleExclamationPoint size={16} className="mt-px shrink-0" />
      )}
      <span className="min-w-0 break-words">{feedback.message}</span>
    </p>
  );
}
