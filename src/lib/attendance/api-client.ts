import type { ApiResponse } from "@/types/attendance/employee.types";

/** Error carrying the HTTP status so callers can distinguish 404 from 500. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Fetches one of the existing `src/app/api/v1` endpoints and unwraps the
 * shared `{ success, data }` envelope.
 *
 * Abort errors propagate untouched so callers can ignore cancelled requests.
 */
export async function fetchApiData<T>(
  url: string,
  signal: AbortSignal
): Promise<T> {
  return requestApiData<T>(url, { signal });
}

/**
 * Calls one of the existing `src/app/api/v1` endpoints that performs an
 * action. Pass a body to send it as JSON; without a body the request stays
 * payload-free (e.g. the device sync trigger).
 */
export async function postApiData<T>(
  url: string,
  body?: unknown
): Promise<T> {
  if (body === undefined) {
    return requestApiData<T>(url, { method: "POST" });
  }

  return requestApiData<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Calls an existing `src/app/api/v1` mutation endpoint with a JSON body
 * (e.g. the attendance waiver toggle).
 */
export async function patchApiData<T>(
  url: string,
  body: unknown
): Promise<T> {
  return requestApiData<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Calls an existing `src/app/api/v1` deletion endpoint.
 * Optionally accepts a body for cancellations that require a reason.
 */
export async function deleteApiData<T>(
  url: string,
  body?: unknown
): Promise<T> {
  if (body === undefined) {
    return requestApiData<T>(url, { method: "DELETE" });
  }

  return requestApiData<T>(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function requestApiData<T>(
  url: string,
  init: RequestInit
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok) {
    const message =
      payload && payload.success === false
        ? payload.message
        : `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status);
  }

  if (!payload || payload.success !== true) {
    throw new ApiError("Unexpected response from server", response.status);
  }

  return payload.data;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
