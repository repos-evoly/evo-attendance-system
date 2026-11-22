"use client";

import { useCallback, useEffect, useState } from "react";
import type { DailyAttendanceResponse } from "@/types/attendance/daily-attendance.types";
import {
  fetchApiData,
  isAbortError,
  toErrorMessage,
} from "@/lib/attendance/api-client";

export interface UseDailyAttendanceResult {
  data: DailyAttendanceResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface DailySnapshot {
  /** Identifies the exact request this snapshot answers. */
  requestId: string;
  data: DailyAttendanceResponse | null;
  error: string | null;
}

/**
 * Loads `GET /api/v1/attendance/daily?date=YYYY-MM-DD`.
 *
 * Loading state is derived from the request identity, so a response for a
 * previous date can never be shown after the date changes (no stale data).
 */
export function useDailyAttendance(date: string): UseDailyAttendanceResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);

  const requestId = `${date}:${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<DailyAttendanceResponse>(
      `/api/v1/attendance/daily?date=${encodeURIComponent(date)}`,
      controller.signal
    )
      .then((data) => {
        if (active) setSnapshot({ requestId, data, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;

        setSnapshot({
          requestId,
          data: null,
          error: toErrorMessage(caught, "Failed to load daily attendance"),
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [date, requestId]);

  const refetch = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const current = snapshot?.requestId === requestId ? snapshot : null;

  return {
    data: current?.data ?? null,
    isLoading: current === null,
    error: current?.error ?? null,
    refetch,
  };
}
