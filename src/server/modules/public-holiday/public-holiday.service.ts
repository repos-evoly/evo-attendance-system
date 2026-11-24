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
import { isWeekend } from "../attendance/attendance.calculator";
import { refreshAndPersistDailyAttendance } from "../attendance/attendance.service";
import { getLibyaToday } from "../attendance/monthly-attendance.calculator";
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

/**
 * Outcome of the attendance refresh that follows a holiday mutation. The
 * holiday itself is already committed when this runs, so failures are
 * collected per date instead of aborting the remaining refreshes; the route
 * turns a non-empty `failedDates` into an explicit error response.
 */
export interface AttendanceRefreshOutcome {
  /** Non-weekend dates up to today that were recalculated and persisted. */
  attemptedDates: number;
  /** Dates whose refresh threw; each is also logged server-side. */
  failedDates: string[];
}

/** Every `YYYY-MM-DD` from `start` to `end` inclusive (both validated dates). */
function* datesBetween(start: string, end: string): Generator<string> {
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);

  while (cursor <= last) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/**
 * Recalculates and persists attendance for every affected date of a holiday:
 * each non-weekend day from `dateFrom` up to `min(dateTo, today)`. A public
 * holiday applies to every employee, and `refreshAndPersistDailyAttendance`
 * already recalculates and persists all of them for a date. Future dates are
 * skipped; weekend days are skipped because `persistDailyAttendance` would
 * discard their WEEKEND rows anyway.
 */
async function refreshAttendanceForPeriod(
  holidayId: string,
  dateFrom: string,
  dateTo: string,
): Promise<AttendanceRefreshOutcome> {
  const today = getLibyaToday();
  const end = dateTo < today ? dateTo : today;
  const failedDates: string[] = [];
  let attemptedDates = 0;

  for (const date of datesBetween(dateFrom, end)) {
    if (isWeekend(date)) continue;

    attemptedDates += 1;

    try {
      await refreshAndPersistDailyAttendance(date);
    } catch (error) {
      console.error(
        `Attendance refresh failed for ${date} after public holiday ${holidayId}:`,
        error,
      );
      failedDates.push(date);
    }
  }

  return { attemptedDates, failedDates };
}

export type CreatePublicHolidayResult =
  | {
      ok: true;
      holiday: PublicHolidayRecord;
      attendanceRefresh: AttendanceRefreshOutcome;
    }
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

  const holiday = await createPublicHoliday({
    ...input,
    name: trimmedName,
  });
  const attendanceRefresh = await refreshAttendanceForPeriod(
    holiday.holidayId,
    holiday.dateFrom,
    holiday.dateTo,
  );

  return { ok: true, holiday, attendanceRefresh };
}

/** Lists all public holiday records. */
export async function listHolidays(): Promise<PublicHolidayRecord[]> {
  return listPublicHolidays();
}

export type UpdatePublicHolidayResult =
  | {
      ok: true;
      holiday: PublicHolidayRecord;
      attendanceRefresh: AttendanceRefreshOutcome;
    }
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

  // The old range loses the holiday and the new range gains it, so both are
  // refreshed; the span between them is refreshed too (idempotent upserts).
  const refreshFrom =
    existing.dateFrom < input.dateFrom ? existing.dateFrom : input.dateFrom;
  const refreshTo =
    existing.dateTo > input.dateTo ? existing.dateTo : input.dateTo;
  const attendanceRefresh = await refreshAttendanceForPeriod(
    updated.holidayId,
    refreshFrom,
    refreshTo,
  );

  return { ok: true, holiday: updated, attendanceRefresh };
}

export type CancelPublicHolidayResult =
  | {
      ok: true;
      holiday: PublicHolidayRecord;
      attendanceRefresh: AttendanceRefreshOutcome;
    }
  | { ok: false; error: PublicHolidayError };

export type ReactivatePublicHolidayResult =
  | {
      ok: true;
      holiday: PublicHolidayRecord;
      attendanceRefresh: AttendanceRefreshOutcome;
    }
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

  const attendanceRefresh = await refreshAttendanceForPeriod(
    cancelled.holidayId,
    cancelled.dateFrom,
    cancelled.dateTo,
  );

  return { ok: true, holiday: cancelled, attendanceRefresh };
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

  const attendanceRefresh = await refreshAttendanceForPeriod(
    reactivated.holidayId,
    reactivated.dateFrom,
    reactivated.dateTo,
  );

  return { ok: true, holiday: reactivated, attendanceRefresh };
}
