"use client";

import { useCallback, useState } from "react";
import { patchApiData, toErrorMessage } from "@/lib/attendance/api-client";

export interface AttendanceWaiverState {
  employeeId: number;
  date: string;
  waiver: boolean;
}

/** One waiver mutation. `reason` is required by the API when granting. */
export interface AttendanceWaiverMutation {
  employeeId: number;
  date: string;
  waiver: boolean;
  reason?: string;
}

export interface UseAttendanceWaiverResult {
  /**
   * Enables or revokes the stored waiver for one employee/day. `onSuccess` runs
   * after the server confirms the change so the caller can refresh its data.
   */
  setWaiver: (
    mutation: AttendanceWaiverMutation,
    onSuccess?: () => void
  ) => void;
  /** True while the mutation for this exact employee/day is in flight. */
  isPending: (employeeId: number, date: string) => boolean;
  /** Message from the last failed mutation, cleared when a new one starts. */
  error: string | null;
}

/**
 * Enables or revokes the existing `attendance.waiver` flag through
 * `PATCH /api/v1/attendance/waiver`.
 *
 * Granting requires a reason; the acting user is resolved from the session on
 * the server, so no user id is sent. The mutation only flips the stored flag
 * and never touches device punches.
 */
export function useAttendanceWaiver(): UseAttendanceWaiverResult {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setWaiver = useCallback(
    (mutation: AttendanceWaiverMutation, onSuccess?: () => void) => {
      const { employeeId, date, waiver, reason } = mutation;

      setPendingKey(`${employeeId}|${date}`);
      setError(null);

      patchApiData<AttendanceWaiverState>("/api/v1/attendance/waiver", {
        employeeId,
        date,
        waiver,
        reason,
      })
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(toErrorMessage(caught, "Failed to update the waiver."));
        })
        .finally(() => {
          setPendingKey(null);
        });
    },
    []
  );

  const isPending = useCallback(
    (employeeId: number, date: string) => pendingKey === `${employeeId}|${date}`,
    [pendingKey]
  );

  return { setWaiver, isPending, error };
}
