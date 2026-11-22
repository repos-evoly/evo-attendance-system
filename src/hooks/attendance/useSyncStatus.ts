"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SyncRunResult,
  SyncStatusResponse,
} from "@/types/sync/sync-status.types";
import {
  ApiError,
  fetchApiData,
  isAbortError,
  postApiData,
  toErrorMessage,
} from "@/lib/attendance/api-client";

/** How the last `runSync()` call ended. */
export type RunSyncOutcome = "completed" | "already-running" | "failed";

export interface RunSyncFeedback {
  outcome: RunSyncOutcome;
  message: string;
}

export interface UseSyncStatusResult {
  data: SyncStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  /** Starts the Sync Service. Ignored while a run is already in flight. */
  runSync: () => void;
  isRunning: boolean;
  /** Result of the last `runSync()` call, cleared when a new one starts. */
  runFeedback: RunSyncFeedback | null;
}

interface SyncStatusSnapshot {
  /** Identifies the exact request this snapshot answers. */
  requestId: string;
  data: SyncStatusResponse | null;
  error: string | null;
}

/**
 * Loads `GET /api/v1/sync/status` and can start `POST /api/v1/sync/run`.
 *
 * The device itself is only ever reached by the separate Sync Service, which
 * owns the lock: this hook just reports its runs and asks the server to start
 * one.
 */
export function useSyncStatus(): UseSyncStatusResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<SyncStatusSnapshot | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runFeedback, setRunFeedback] = useState<RunSyncFeedback | null>(null);

  /** Guards against a second request before React re-renders the button. */
  const runningRef = useRef(false);

  const requestId = String(reloadKey);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<SyncStatusResponse>("/api/v1/sync/status", controller.signal)
      .then((data) => {
        if (active) setSnapshot({ requestId, data, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;

        setSnapshot({
          requestId,
          data: null,
          error: toErrorMessage(caught, "Failed to load device sync status"),
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [requestId]);

  const refetch = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const runSync = useCallback(() => {
    if (runningRef.current) return;

    runningRef.current = true;
    setIsRunning(true);
    setRunFeedback(null);

    postApiData<SyncRunResult>("/api/v1/sync/run")
      .then((result) => {
        setRunFeedback({ outcome: "completed", message: result.message });
      })
      .catch((caught: unknown) => {
        const alreadyRunning =
          caught instanceof ApiError && caught.status === 409;

        setRunFeedback({
          outcome: alreadyRunning ? "already-running" : "failed",
          message: toErrorMessage(caught, "The device sync failed."),
        });
      })
      .finally(() => {
        runningRef.current = false;
        setIsRunning(false);
        // The run writes punches and a `sync_runs` row, so reload the status.
        setReloadKey((key) => key + 1);
      });
  }, []);

  const current = snapshot?.requestId === requestId ? snapshot : null;

  return {
    data: current?.data ?? null,
    isLoading: current === null,
    error: current?.error ?? null,
    refetch,
    runSync,
    isRunning,
    runFeedback,
  };
}
