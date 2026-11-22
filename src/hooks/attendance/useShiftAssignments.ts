"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CreateShiftAssignmentRequest,
  ShiftAssignment,
  UpdateShiftAssignmentRequest,
} from "@/types/attendance/shift-assignment.types";
import {
  fetchApiData,
  isAbortError,
  patchApiData,
  postApiData,
  toErrorMessage,
} from "@/lib/attendance/api-client";

export interface UseShiftAssignmentsResult {
  assignments: ShiftAssignment[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface AssignmentsSnapshot {
  key: number;
  assignments: ShiftAssignment[];
  error: string | null;
}

/**
 * Loads shift assignments from `GET /api/v1/shifts/assignments`,
 * optionally filtered by `employeeId`.
 */
export function useShiftAssignments(employeeId?: number): UseShiftAssignmentsResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<AssignmentsSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const url =
      employeeId !== undefined
        ? `/api/v1/shifts/assignments?employeeId=${employeeId}`
        : "/api/v1/shifts/assignments";

    fetchApiData<ShiftAssignment[]>(url, controller.signal)
      .then((assignments) => {
        if (!active) return;
        setSnapshot({ key: reloadKey, assignments, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setSnapshot({
          key: reloadKey,
          assignments: [],
          error: toErrorMessage(caught, "Failed to load shift assignments"),
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey, employeeId]);

  const refetch = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const isLoading = snapshot === null || snapshot.key !== reloadKey;

  return {
    assignments: snapshot?.assignments ?? [],
    isLoading,
    error: isLoading ? null : snapshot?.error ?? null,
    refetch,
  };
}

export interface UseCreateShiftAssignmentResult {
  createAssignment: (
    input: CreateShiftAssignmentRequest,
    onSuccess?: () => void
  ) => void;
  isPending: boolean;
  error: string | null;
}

/**
 * Creates a shift assignment through `POST /api/v1/shifts/assignments`.
 */
export function useCreateShiftAssignment(): UseCreateShiftAssignmentResult {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAssignment = useCallback(
    (input: CreateShiftAssignmentRequest, onSuccess?: () => void) => {
      setIsPending(true);
      setError(null);

      postApiData<ShiftAssignment>("/api/v1/shifts/assignments", input)
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(toErrorMessage(caught, "Failed to create shift assignment."));
        })
        .finally(() => {
          setIsPending(false);
        });
    },
    []
  );

  return { createAssignment, isPending, error };
}

export interface UseUpdateShiftAssignmentResult {
  updateAssignment: (
    id: string,
    input: UpdateShiftAssignmentRequest,
    onSuccess?: () => void
  ) => void;
  isPending: (id: string) => boolean;
  error: string | null;
}

/**
 * Updates a shift assignment through `PATCH /api/v1/shifts/assignments/{id}`.
 */
export function useUpdateShiftAssignment(): UseUpdateShiftAssignmentResult {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateAssignment = useCallback(
    (
      id: string,
      input: UpdateShiftAssignmentRequest,
      onSuccess?: () => void
    ) => {
      setPendingId(id);
      setError(null);

      patchApiData<ShiftAssignment>(`/api/v1/shifts/assignments/${id}`, input)
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(toErrorMessage(caught, "Failed to update shift assignment."));
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    []
  );

  const isPending = useCallback(
    (id: string) => pendingId === id,
    [pendingId]
  );

  return { updateAssignment, isPending, error };
}
