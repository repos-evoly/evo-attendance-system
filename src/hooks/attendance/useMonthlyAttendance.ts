"use client";

import { useCallback, useEffect, useState } from "react";
import type { MonthlyAttendanceResponse } from "@/types/attendance/monthly-attendance.types";
import {
  fetchApiData,
  isAbortError,
  toErrorMessage,
} from "@/lib/attendance/api-client";

export interface UseMonthlyAttendanceResult {
  data: MonthlyAttendanceResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface MonthlySnapshot {
  /** Identifies the exact request this snapshot answers. */
  requestId: string;
  data: MonthlyAttendanceResponse | null;
  error: string | null;
}

/**
 * Loads `GET /api/v1/attendance/monthly-attendance?month=YYYY-MM`.
 *
 * Pass an `employeeId` to additionally receive one daily row per calendar day
 * of the month for that employee (`data.days`), so the Employee Details page
 * shows a full month without one request per day.
 *
 * As with the daily hook, loading state is derived from the request identity
 * so switching months can never display a stale result.
 */
export function useMonthlyAttendance(
  month: string,
  employeeId?: number | null
): UseMonthlyAttendanceResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<MonthlySnapshot | null>(null);

  const requestId = `${month}:${employeeId ?? "all"}:${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const params = new URLSearchParams({ month });

    if (employeeId != null) {
      params.set("employeeId", String(employeeId));
    }

    fetchApiData<MonthlyAttendanceResponse>(
      `/api/v1/attendance/monthly-attendance?${params.toString()}`,
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
          error: toErrorMessage(caught, "Failed to load monthly attendance"),
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [month, employeeId, requestId]);

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
