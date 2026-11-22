/**
 * Types mirroring the `/api/v1/sync` endpoints.
 *
 * Both routes read or start the existing Sync Service process; neither one
 * talks to the device itself. The `sync_runs` rows come from the Prisma
 * `SyncRun` model.
 */

export interface SyncRunSummary {
  /** BIGINT primary key, serialized as a string because JSON has no BigInt. */
  id: string;
  /** Raw `sync_runs.status`, e.g. "running", "ok", "failed". */
  status: string;
  /** ISO timestamp. */
  startedAt: string;
  /** ISO timestamp, null while the run is still going. */
  finishedAt: string | null;
  recordsSeen: number;
  recordsNew: number;
  duplicatesSkipped: number;
  error: string | null;
}

export interface SyncStatusResponse {
  /** Most recent run by `started_at`, or null when nothing was recorded yet. */
  latest: SyncRunSummary | null;
  /** The last runs, newest first. Empty when nothing was synchronized. */
  recent: SyncRunSummary[];
}

/** `data` returned by `POST /api/v1/sync/run` when the sync finished. */
export interface SyncRunResult {
  /** Exit code of the Sync Service; 0 means the run completed. */
  exitCode: number;
  /** Human readable confirmation, safe to display. */
  message: string;
}
