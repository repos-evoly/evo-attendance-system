"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CreateUserRequest,
  UpdatePasswordRequest,
  UpdateStatusRequest,
  UpdateUserRequest,
  UserAccount,
  UserRole,
} from "@/types/attendance/user.types";
import {
  fetchApiData,
  isAbortError,
  patchApiData,
  postApiData,
  toErrorMessage,
} from "@/lib/attendance/api-client";

export interface UseUsersResult {
  users: UserAccount[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UsersSnapshot {
  key: number;
  users: UserAccount[];
  error: string | null;
}

/**
 * Loads every system account from `GET /api/v1/users`.
 * Restricted to ADMIN role.
 */
export function useUsers(): UseUsersResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<UsersSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<UserAccount[]>("/api/v1/users", controller.signal)
      .then((users) => {
        if (!active) return;
        setSnapshot({ key: reloadKey, users, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setSnapshot({
          key: reloadKey,
          users: [],
          error: toErrorMessage(caught, "Failed to load user accounts"),
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
    users: snapshot?.users ?? [],
    isLoading,
    error: isLoading ? null : snapshot?.error ?? null,
    refetch,
  };
}

export interface UseCreateUserResult {
  createUser: (input: CreateUserRequest, onSuccess?: () => void) => void;
  isPending: boolean;
  error: string | null;
}

/**
 * Creates an account through `POST /api/v1/users`.
 */
export function useCreateUser(): UseCreateUserResult {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createUser = useCallback(
    (input: CreateUserRequest, onSuccess?: () => void) => {
      setIsPending(true);
      setError(null);

      postApiData<UserAccount>("/api/v1/users", input)
        .then(() => {
          setIsPending(false);
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setIsPending(false);
          setError(toErrorMessage(caught, "Failed to create the user account"));
        });
    },
    []
  );

  return { createUser, isPending, error };
}

export interface UseUpdateUserResult {
  updateUser: (
    userId: string,
    input: UpdateUserRequest,
    onSuccess?: () => void
  ) => void;
  isPending: (userId: string) => boolean;
  error: string | null;
}

/**
 * Updates a user account (password, status, and/or role) through `PATCH /api/v1/users/[userId]`.
 */
export function useUpdateUser(): UseUpdateUserResult {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateUser = useCallback(
    (userId: string, input: UpdateUserRequest, onSuccess?: () => void) => {
      setPendingId(userId);
      setError(null);

      patchApiData<UserAccount>(`/api/v1/users/${userId}`, input)
        .then(() => {
          onSuccess?.();
        })
        .catch((caught: unknown) => {
          setError(toErrorMessage(caught, "Failed to update the user account."));
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    []
  );

  const isPending = useCallback(
    (userId: string) => pendingId === userId,
    [pendingId]
  );

  return { updateUser, isPending, error };
}

export interface UseUpdatePasswordResult {
  updateUserPassword: (
    userId: string,
    input: UpdatePasswordRequest,
    onSuccess?: () => void
  ) => void;
  isPending: (userId: string) => boolean;
  error: string | null;
}

export function useUpdatePassword(): UseUpdatePasswordResult {
  const { updateUser, isPending, error } = useUpdateUser();

  const updateUserPassword = useCallback(
    (userId: string, input: UpdatePasswordRequest, onSuccess?: () => void) => {
      updateUser(userId, input, onSuccess);
    },
    [updateUser]
  );

  return { updateUserPassword, isPending, error };
}

export interface UseUpdateStatusResult {
  updateUserStatus: (
    userId: string,
    input: UpdateStatusRequest,
    onSuccess?: () => void
  ) => void;
  isPending: (userId: string) => boolean;
  error: string | null;
}

export function useUpdateStatus(): UseUpdateStatusResult {
  const { updateUser, isPending, error } = useUpdateUser();

  const updateUserStatus = useCallback(
    (userId: string, input: UpdateStatusRequest, onSuccess?: () => void) => {
      updateUser(userId, input, onSuccess);
    },
    [updateUser]
  );

  return { updateUserStatus, isPending, error };
}

export interface UseUpdateRoleResult {
  updateUserRole: (
    userId: string,
    input: { role: UserRole },
    onSuccess?: () => void
  ) => void;
  isPending: (userId: string) => boolean;
  error: string | null;
}

export function useUpdateRole(): UseUpdateRoleResult {
  const { updateUser, isPending, error } = useUpdateUser();

  const updateUserRole = useCallback(
    (userId: string, input: { role: UserRole }, onSuccess?: () => void) => {
      updateUser(userId, input, onSuccess);
    },
    [updateUser]
  );

  return { updateUserRole, isPending, error };
}
