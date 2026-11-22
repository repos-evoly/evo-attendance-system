"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CreatePublicHolidayRequest,
  PublicHoliday,
  UpdatePublicHolidayRequest,
} from "@/types/attendance/public-holiday.types";
import {
  deleteApiData,
  fetchApiData,
  isAbortError,
  patchApiData,
  postApiData,
  toErrorMessage,
} from "@/lib/attendance/api-client";

export interface UsePublicHolidaysResult {
  holidays: PublicHoliday[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface HolidaysSnapshot {
  /** Reload counter the snapshot belongs to. */
  key: number;
  holidays: PublicHoliday[];
  error: string | null;
}

/**
 * Loads every public holiday record from `GET /api/v1/public-holidays`.
 *
 * Changing each `refetch()` reloads the list, which is how the page picks up a
 * new holiday, an edit, or a deletion. Loading state is derived from the reload
 * counter, so no state is set synchronously inside the effect.
 */
export function usePublicHolidays(): UsePublicHolidaysResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<HolidaysSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<PublicHoliday[]>(
      "/api/v1/public-holidays",
      controller.signal
    )
      .then((holidays) => {
        if (!active) return;
        setSnapshot({ key: reloadKey, holidays, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setSnapshot({
          key: reloadKey,
          holidays: [],
          error: toErrorMessage(caught, "Failed to load public holiday records"),
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
    holidays: snapshot?.holidays ?? [],
    isLoading,
    error: isLoading ? null : snapshot?.error ?? null,
    refetch,
  };
}

export interface UseCreatePublicHolidayResult {
  /** Creates a holiday through `POST /api/v1/public-holidays`; the reason is optional. */
  createHoliday: (input: CreatePublicHolidayRequest, onSuccess?: () => void) => void;
  isPending: boolean;
  error: string | null;
}

/**
 * Creates a public holiday record. `createdById` is resolved from the session on the
 * server, so no user id is ever sent from the browser.
 */
export function useCreatePublicHoliday(): UseCreatePublicHolidayResult {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createHoliday = useCallback(
    (input: CreatePublicHolidayRequest, onSuccess?: () => void) => {
      setIsPending(true);
      setError(null);

      postApiData<PublicHoliday>("/api/v1/public-holidays", input)
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(
            toErrorMessage(caught, "Failed to create the public holiday record.")
          );
        })
        .finally(() => {
          setIsPending(false);
        });
    },
    []
  );

  return { createHoliday, isPending, error };
}

export interface UseUpdatePublicHolidayResult {
  /**
   * Updates a holiday through `PATCH /api/v1/public-holidays/[holidayId]`.
   * `onSuccess` runs once the server confirms.
   */
  updateHoliday: (
    holidayId: string,
    input: UpdatePublicHolidayRequest,
    onSuccess?: () => void
  ) => void;
  /** True while the mutation for this exact holiday is in flight. */
  isPending: (holidayId: string) => boolean;
  error: string | null;
}

/**
 * Updates a public holiday. The acting user comes from the session.
 */
export function useUpdatePublicHoliday(): UseUpdatePublicHolidayResult {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateHoliday = useCallback(
    (holidayId: string, input: UpdatePublicHolidayRequest, onSuccess?: () => void) => {
      setPendingId(holidayId);
      setError(null);

      patchApiData<PublicHoliday>(`/api/v1/public-holidays/${holidayId}`, input)
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(
            toErrorMessage(caught, "Failed to update the public holiday record.")
          );
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    []
  );

  const isPending = useCallback(
    (holidayId: string) => pendingId === holidayId,
    [pendingId]
  );

  return { updateHoliday, isPending, error };
}

export interface UseDeletePublicHolidayResult {
  /**
   * Cancels a holiday through `DELETE /api/v1/public-holidays/[holidayId]`.
   * The record is kept and marked cancelled; `onSuccess` runs once the server confirms.
   */
  deleteHoliday: (
    holidayId: string,
    reason: string,
    onSuccess?: () => void
  ) => void;
  /** True while the mutation for this exact holiday is in flight. */
  isPending: (holidayId: string) => boolean;
  error: string | null;
}

/**
 * Cancels an active public holiday. The cancellation reason and the acting user are
 * required by the API, and the acting user comes from the session.
 */
export function useDeletePublicHoliday(): UseDeletePublicHolidayResult {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deleteHoliday = useCallback(
    (holidayId: string, reason: string, onSuccess?: () => void) => {
      setPendingId(holidayId);
      setError(null);

      deleteApiData<PublicHoliday>(
        `/api/v1/public-holidays/${holidayId}`,
        { reason }
      )
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(
            toErrorMessage(caught, "Failed to cancel the public holiday record.")
          );
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    []
  );

  const isPending = useCallback(
    (holidayId: string) => pendingId === holidayId,
    [pendingId]
  );

  return { deleteHoliday, isPending, error };
}

export interface UseReactivatePublicHolidayResult {
  /**
   * Reactivates a cancelled holiday through `POST /api/v1/public-holidays/[holidayId]`.
   * `onSuccess` runs once the server confirms.
   */
  reactivateHoliday: (
    holidayId: string,
    onSuccess?: () => void
  ) => void;
  /** True while the mutation for this exact holiday is in flight. */
  isPending: (holidayId: string) => boolean;
  error: string | null;
}

/**
 * Reactivates a cancelled public holiday. The acting user comes from the session.
 */
export function useReactivatePublicHoliday(): UseReactivatePublicHolidayResult {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reactivateHoliday = useCallback(
    (holidayId: string, onSuccess?: () => void) => {
      setPendingId(holidayId);
      setError(null);

      postApiData<PublicHoliday>(
        `/api/v1/public-holidays/${holidayId}`,
        {}
      )
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(
            toErrorMessage(caught, "Failed to reactivate the public holiday record.")
          );
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    []
  );

  const isPending = useCallback(
    (holidayId: string) => pendingId === holidayId,
    [pendingId]
  );

  return { reactivateHoliday, isPending, error };
}
