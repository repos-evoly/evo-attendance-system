"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Employee,
  Shift,
} from "@/types/attendance/employee.types";
import {
  ApiError,
  fetchApiData,
  isAbortError,
  toErrorMessage,
} from "@/lib/attendance/api-client";

export interface UseEmployeesResult {
  employees: Employee[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface EmployeesSnapshot {
  /** Reload counter the snapshot belongs to. */
  key: number;
  employees: Employee[];
  error: string | null;
}

/**
 * Loads the employee directory from `GET /api/v1/employees`.
 *
 * Loading state is derived from whether the snapshot matches the current
 * reload counter, so no state is set synchronously inside the effect.
 */
export function useEmployees(): UseEmployeesResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<EmployeesSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<Employee[]>("/api/v1/employees", controller.signal)
      .then((employees) => {
        if (!active) return;
        setSnapshot({ key: reloadKey, employees, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setSnapshot({
          key: reloadKey,
          employees: [],
          error: toErrorMessage(caught, "Failed to load employees"),
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
    employees: snapshot?.employees ?? [],
    isLoading,
    error: isLoading ? null : snapshot?.error ?? null,
    refetch,
  };
}

export interface UseEmployeeResult {
  employee: Employee | null;
  isLoading: boolean;
  error: string | null;
  notFound: boolean;
  refetch: () => void;
}

interface EmployeeSnapshot {
  /** Identifies the exact request this snapshot answers. */
  requestId: string;
  employee: Employee | null;
  error: string | null;
  notFound: boolean;
}

/**
 * Loads a single employee from `GET /api/v1/employees/[employeeId]`.
 * Pass `null` to skip the request (used when the route param is invalid).
 */
export function useEmployee(employeeId: number | null): UseEmployeeResult {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<EmployeeSnapshot | null>(null);

  const requestId = `${employeeId ?? "none"}:${reloadKey}`;

  useEffect(() => {
    if (employeeId === null) return;

    const controller = new AbortController();
    let active = true;

    fetchApiData<Employee>(`/api/v1/employees/${employeeId}`, controller.signal)
      .then((employee) => {
        if (!active) return;
        setSnapshot({
          requestId,
          employee,
          error: null,
          notFound: false,
        });
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;

        if (caught instanceof ApiError && caught.status === 404) {
          setSnapshot({
            requestId,
            employee: null,
            error: null,
            notFound: true,
          });
          return;
        }

        setSnapshot({
          requestId,
          employee: null,
          error: toErrorMessage(caught, "Failed to load employee"),
          notFound: false,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [employeeId, requestId]);

  const refetch = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const current = snapshot?.requestId === requestId ? snapshot : null;

  return {
    employee: current?.employee ?? null,
    isLoading: employeeId !== null && current === null,
    error: current?.error ?? null,
    notFound: current?.notFound ?? false,
    refetch,
  };
}

export interface UseShiftsResult {
  shifts: Shift[];
  isLoading: boolean;
}

/** Loads shifts from `GET /api/v1/shifts` (used to label assigned shifts). */
export function useShifts(): UseShiftsResult {
  const [shifts, setShifts] = useState<Shift[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchApiData<Shift[]>("/api/v1/shifts", controller.signal)
      .then((data) => {
        if (active) setShifts(data);
      })
      .catch(() => {
        // Shift labels are non-critical: fall back to an empty lookup.
        if (active) setShifts([]);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return { shifts: shifts ?? [], isLoading: shifts === null };
}
