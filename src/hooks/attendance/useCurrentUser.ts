"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApiData, isAbortError, toErrorMessage } from "@/lib/attendance/api-client";
import type { UserRole } from "@/types/attendance/user.types";

export interface CurrentUser {
  userId: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  isOriginalAdmin: boolean;
  activeAdminCount?: number;
}

export interface UseCurrentUserResult {
  currentUser: CurrentUser | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Loads the current authenticated user from `GET /api/v1/auth/me`.
 */
export function useCurrentUser(): UseCurrentUserResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    key: number;
    currentUser: CurrentUser | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<CurrentUser>("/api/v1/auth/me", controller.signal)
      .then((currentUser) => {
        if (!active) return;
        setSnapshot({ key: reloadKey, currentUser, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setSnapshot({
          key: reloadKey,
          currentUser: null,
          error: toErrorMessage(caught, "Failed to load current user"),
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
    currentUser: snapshot?.currentUser ?? null,
    isLoading,
    error: isLoading ? null : snapshot?.error ?? null,
    refetch,
  };
}
