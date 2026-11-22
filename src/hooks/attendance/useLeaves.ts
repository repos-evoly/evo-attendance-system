"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CreateLeaveRequest,
  EmployeeLeave,
} from "@/types/attendance/leave.types";
import {
  fetchApiData,
  isAbortError,
  patchApiData,
  postApiData,
  toErrorMessage,
} from "@/lib/attendance/api-client";

export interface UseLeavesResult {
  leaves: EmployeeLeave[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface LeavesSnapshot {
  /** Reload counter the snapshot belongs to. */
  key: number;
  leaves: EmployeeLeave[];
  error: string | null;
}

/**
 * Loads every leave record (active and cancelled) from `GET /api/v1/leave`.
 *
 * Changing each `refetch()` reloads the list, which is how the page picks up a
 * new leave, a cancellation, or the effect a cancellation has on attendance.
 * Loading state is derived from the reload counter, so no state is set
 * synchronously inside the effect.
 */
export function useLeaves(): UseLeavesResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<LeavesSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<EmployeeLeave[]>("/api/v1/leave", controller.signal)
      .then((leaves) => {
        if (!active) return;
        setSnapshot({ key: reloadKey, leaves, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setSnapshot({
          key: reloadKey,
          leaves: [],
          error: toErrorMessage(caught, "Failed to load leave records"),
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  const refetch = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const isLoading = snapshot === null || snapshot.key !== reloadKey;

  return {
    leaves: snapshot?.leaves ?? [],
    isLoading,
    error: isLoading ? null : snapshot?.error ?? null,
    refetch,
  };
}

export interface UseCreateLeaveResult {
  /** Creates a leave through `POST /api/v1/leave`; the reason is optional. */
  createLeave: (input: CreateLeaveRequest, onSuccess?: () => void) => void;
  isPending: boolean;
  error: string | null;
}

/**
 * Creates a leave record. `createdById` is resolved from the session on the
 * server, so no user id is ever sent from the browser.
 */
export function useCreateLeave(): UseCreateLeaveResult {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLeave = useCallback(
    (input: CreateLeaveRequest, onSuccess?: () => void) => {
      setIsPending(true);
      setError(null);

      postApiData<EmployeeLeave>("/api/v1/leave", input)
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(toErrorMessage(caught, "Failed to create the leave record."));
        })
        .finally(() => {
          setIsPending(false);
        });
    },
    []
  );

  return { createLeave, isPending, error };
}

export interface UseCancelLeaveResult {
  /**
   * Cancels a leave through `PATCH /api/v1/leave/[leaveId]`. The record is kept
   * and marked CANCELLED; `onSuccess` runs once the server confirms.
   */
  cancelLeave: (
    leaveId: string,
    reason: string,
    onSuccess?: () => void
  ) => void;
  /** True while the mutation for this exact leave is in flight. */
  isPending: (leaveId: string) => boolean;
  error: string | null;
}

/**
 * Cancels an active leave. The cancellation reason and the acting user are
 * required by the API, and the acting user comes from the session.
 */
export function useCancelLeave(): UseCancelLeaveResult {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancelLeave = useCallback(
    (leaveId: string, reason: string, onSuccess?: () => void) => {
      setPendingId(leaveId);
      setError(null);

      patchApiData<EmployeeLeave>(`/api/v1/leave/${leaveId}`, { reason })
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(
            toErrorMessage(caught, "Failed to cancel the leave record.")
          );
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    []
  );

  const isPending = useCallback(
    (leaveId: string) => pendingId === leaveId,
    [pendingId]
  );

  return { cancelLeave, isPending, error };
}
