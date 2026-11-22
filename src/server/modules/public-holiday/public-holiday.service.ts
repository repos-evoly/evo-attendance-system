import {
  cancelPublicHoliday,
  createPublicHoliday,
  getPublicHoliday,
  listActivePublicHolidays,
  listPublicHolidays,
  reactivatePublicHoliday as reactivatePublicHolidayRepo,
  updatePublicHoliday,
} from "./public-holiday.repository";
import { findOverlappingHoliday } from "./public-holiday.utils";
import type {
  CancelPublicHolidayInput,
  CreatePublicHolidayInput,
  PublicHolidayRecord,
  ReactivatePublicHolidayInput,
  UpdatePublicHolidayInput,
} from "./public-holiday.types";

/** Machine-readable failure codes so the route can pick the HTTP status. */
export type PublicHolidayErrorCode =
  | "INVALID_RANGE"
  | "NAME_REQUIRED"
  | "OVERLAP"
  | "NOT_FOUND"
  | "ALREADY_CANCELLED"
  | "NOT_CANCELLED";

export interface PublicHolidayError {
  code: PublicHolidayErrorCode;
  message: string;
}

export type CreatePublicHolidayResult =
  | { ok: true; holiday: PublicHolidayRecord }
  | { ok: false; error: PublicHolidayError };

/**
 * Creates one public holiday record.
 *
 * Business rules, all enforced here:
 * - `name` must be non-empty after trimming;
 * - `dateTo` must be on or after `dateFrom`;
 * - the period must not overlap another public holiday (both bounds inclusive).
 *
 * `createdById` always comes from the verified session, never the request body.
 */
export async function createHoliday(
  input: CreatePublicHolidayInput,
): Promise<CreatePublicHolidayResult> {
  const trimmedName = input.name.trim();

  if (trimmedName.length === 0) {
    return {
      ok: false,
      error: {
        code: "NAME_REQUIRED",
        message: "Holiday name is required.",
      },
    };
  }

  if (input.dateTo < input.dateFrom) {
    return {
      ok: false,
      error: {
        code: "INVALID_RANGE",
        message: "dateTo must be on or after dateFrom.",
      },
    };
  }

  const existing = await listActivePublicHolidays();
  const overlap = findOverlappingHoliday(existing, input.dateFrom, input.dateTo);

  if (overlap) {
    return {
      ok: false,
      error: {
        code: "OVERLAP",
        message: `The period overlaps an existing public holiday (${overlap.dateFrom} to ${overlap.dateTo}).`,
      },
    };
  }

  return {
    ok: true,
    holiday: await createPublicHoliday({
      ...input,
      name: trimmedName,
    }),
  };
}

/** Lists all public holiday records. */
export async function listHolidays(): Promise<PublicHolidayRecord[]> {
  return listPublicHolidays();
}

export type UpdatePublicHolidayResult =
  | { ok: true; holiday: PublicHolidayRecord }
  | { ok: false; error: PublicHolidayError };

/**
 * Updates one public holiday record.
 *
 * Business rules, all enforced here:
 * - `name` must be non-empty after trimming;
 * - `dateTo` must be on or after `dateFrom`;
 * - the period must not overlap another public holiday (both bounds inclusive),
 *   excluding the current holiday itself.
 * - the holiday must exist.
 */
export async function updateHoliday(
  holidayId: bigint,
  input: UpdatePublicHolidayInput,
): Promise<UpdatePublicHolidayResult> {
  const existing = await getPublicHoliday(holidayId);

  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Public holiday not found." },
    };
  }

  const trimmedName = input.name.trim();

  if (trimmedName.length === 0) {
    return {
      ok: false,
      error: {
        code: "NAME_REQUIRED",
        message: "Holiday name is required.",
      },
    };
  }

  if (input.dateTo < input.dateFrom) {
    return {
      ok: false,
      error: {
        code: "INVALID_RANGE",
        message: "dateTo must be on or after dateFrom.",
      },
    };
  }

  const allHolidays = await listActivePublicHolidays();
  const otherHolidays = allHolidays.filter((h) => h.holidayId !== holidayId.toString());
  const overlap = findOverlappingHoliday(otherHolidays, input.dateFrom, input.dateTo);

  if (overlap) {
    return {
      ok: false,
      error: {
        code: "OVERLAP",
        message: `The period overlaps an existing public holiday (${overlap.dateFrom} to ${overlap.dateTo}).`,
      },
    };
  }

  const updated = await updatePublicHoliday(holidayId, {
    ...input,
    name: trimmedName,
  });

  if (!updated) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Public holiday not found." },
    };
  }

  return { ok: true, holiday: updated };
}

export type CancelPublicHolidayResult =
  | { ok: true; holiday: PublicHolidayRecord }
  | { ok: false; error: PublicHolidayError };

export type ReactivatePublicHolidayResult =
  | { ok: true; holiday: PublicHolidayRecord }
  | { ok: false; error: PublicHolidayError };

/**
 * Cancels an ACTIVE public holiday record.
 *
 * The record is never deleted: the canceller, the timestamp and the reason
 * are stored alongside the original details. Cancelling an unknown or
 * already-cancelled holiday is rejected, so the first cancellation's audit
 * data can never be overwritten.
 *
 * The acting user comes from the verified session, never the request body.
 */
export async function cancelHoliday(
  holidayId: bigint,
  input: CancelPublicHolidayInput,
): Promise<CancelPublicHolidayResult> {
  const existing = await getPublicHoliday(holidayId);

  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Public holiday not found." },
    };
  }

  if (existing.cancelledAt !== null) {
    return {
      ok: false,
      error: {
        code: "ALREADY_CANCELLED",
        message: "This public holiday is already cancelled.",
      },
    };
  }

  const cancelled = await cancelPublicHoliday(holidayId, input);

  // The guarded update can still miss when the row was cancelled concurrently.
  if (!cancelled) {
    return {
      ok: false,
      error: {
        code: "ALREADY_CANCELLED",
        message: "This public holiday is already cancelled.",
      },
    };
  }

  return { ok: true, holiday: cancelled };
}

/**
 * Reactivates a CANCELLED public holiday record.
 *
 * Clears the cancellation fields to restore the holiday as ACTIVE.
 * The original cancellation audit information is preserved in the record's history.
 * Reactivating an unknown or already-active holiday is rejected.
 */
export async function reactivateHoliday(
  holidayId: bigint,
  input: ReactivatePublicHolidayInput,
): Promise<ReactivatePublicHolidayResult> {
  const existing = await getPublicHoliday(holidayId);

  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Public holiday not found." },
    };
  }

  if (existing.cancelledAt === null) {
    return {
      ok: false,
      error: {
        code: "NOT_CANCELLED",
        message: "This public holiday is already active.",
      },
    };
  }

  const reactivated = await reactivatePublicHolidayRepo(holidayId, input);

  // The guarded update can still miss when the row was reactivated concurrently.
  if (!reactivated) {
    return {
      ok: false,
      error: {
        code: "NOT_CANCELLED",
        message: "This public holiday is already active.",
      },
    };
  }

  return { ok: true, holiday: reactivated };
}
