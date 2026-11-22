"use client";

import { Clock, RefreshCw, TriangleExclamationPoint } from "lucide-react";
import type { SyncRunSummary } from "@/types/sync/sync-status.types";
import type { UseSyncStatusResult } from "@/hooks/attendance/useSyncStatus";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";
import { SyncRunButton, SyncRunFeedback } from "./SyncRunButton";

const STATUS_LABELS: Record<string, string> = {
  ok: "Succeeded",
  ok_with_warning: "Completed with warnings",
  running: "Running",
  failed: "Failed",
};

const STATUS_STYLES: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  ok_with_warning: "bg-amber-50 text-amber-700 ring-amber-100",
  running: "bg-sky-50 text-sky-700 ring-sky-100",
  failed: "bg-rose-50 text-rose-700 ring-rose-100",
};

const UNKNOWN_STATUS_STYLE = "bg-slate-100 text-slate-600 ring-slate-200";

/**
 * Timestamps arrive as ISO strings. Formatting happens on the client only
 * (the section renders after the request resolves), so the local timezone and
 * locale can never differ between the server and the browser.
 */
function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "—";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** The run's end time when it finished, otherwise when it started. */
function displayTime(run: SyncRunSummary): string {
  return formatTimestamp(run.finishedAt ?? run.startedAt);
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        STATUS_STYLES[status] ?? UNKNOWN_STATUS_STYLE
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StatusMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold text-slate-900">{value}</dd>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

interface SyncStatusCardProps {
  /**
   * `GET /api/v1/sync/status` plus the `runSync` action. The button only asks
   * the server to start the existing Sync Service, which owns the lock and
   * the device connection.
   */
  status: UseSyncStatusResult;
}

/**
 * Device synchronization status: the latest result plus the last runs.
 *
 * The device is only ever read by the separate Sync Service, so the Run Sync
 * button starts that service server-side and never talks to the device.
 */
export function SyncStatusCard({ status }: SyncStatusCardProps) {
  const latest = status.data?.latest ?? null;
  const recent = status.data?.recent ?? [];

  return (
    <section className="glass-card rounded-3xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-700">
            <RefreshCw size={18} />
            <h2 className="text-sm font-semibold text-slate-800">Device sync</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Latest result recorded by the Sync Service.
          </p>
        </div>

        <SyncRunButton status={status} />
      </div>

      <SyncRunFeedback feedback={status.runFeedback} className="mt-3" />

      <div className="mt-4">
        {status.isLoading ? (
          <ReportLoadingState message="Loading sync status…" />
        ) : status.error ? (
          <ReportErrorState message={status.error} onRetry={status.refetch} />
        ) : latest === null ? (
          <ReportEmptyState
            icon={<RefreshCw size={22} />}
            title="No sync recorded yet"
            message="No device synchronization has been recorded. Use Run Sync to start one."
          />
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Latest result
                </dt>
                <dd className="mt-1.5">
                  <StatusPill status={latest.status} />
                </dd>
              </div>
              <StatusMetric
                label="Last sync"
                value={displayTime(latest)}
                hint={latest.finishedAt ? "Finished" : "Started"}
              />
              <StatusMetric
                label="New records"
                value={String(latest.recordsNew)}
                hint={`${latest.recordsSeen} seen`}
              />
              <StatusMetric
                label="Duplicates skipped"
                value={String(latest.duplicatesSkipped)}
              />
            </dl>

            {latest.error && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-3 text-xs text-rose-700"
              >
                <TriangleExclamationPoint size={16} className="mt-px shrink-0" />
                <span className="min-w-0 break-words">{latest.error}</span>
              </p>
            )}

            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recent runs
            </h3>

            <ul className="mt-2 flex flex-col divide-y divide-slate-100">
              {recent.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-xs"
                >
                  <StatusPill status={run.status} />
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Clock size={13} className="text-slate-400" />
                    {displayTime(run)}
                  </span>
                  <span className="text-slate-500">
                    {run.recordsNew} new
                  </span>
                  <span className="text-slate-400">
                    {run.duplicatesSkipped} skipped
                  </span>
                  {run.error && (
                    <span className="w-full break-words text-rose-600">
                      {run.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
