"use client";

import { useCallback, useEffect, useState } from "react";
import type { WaiverRecord } from "@/types/attendance/waiver.types";
import {
  fetchApiData,
  isAbortError,
  toErrorMessage,
} from "@/lib/attendance/api-client";

export interface UseWaiversResult {
  waivers: WaiverRecord[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface WaiversSnapshot {
  /** Reload counter the snapshot belongs to. */
  key: number;
  waivers: WaiverRecord[];
  error: string | null;
}

/**
 * Loads every waiver record (active and revoked) from `GET /api/v1/waivers`.
 *
 * Loading state is derived from whether the snapshot matches the current reload
 * counter, so no state is set synchronously inside the effect.
 */
export function useWaivers(): UseWaiversResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<WaiversSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<WaiverRecord[]>("/api/v1/waivers", controller.signal)
      .then((waivers) => {
        if (!active) return;
        setSnapshot({ key: reloadKey, waivers, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setSnapshot({
          key: reloadKey,
          waivers: [],
          error: toErrorMessage(caught, "Failed to load waiver records"),
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
    waivers: snapshot?.waivers ?? [],
    isLoading,
    error: isLoading ? null : snapshot?.error ?? null,
    refetch,
  };
}
