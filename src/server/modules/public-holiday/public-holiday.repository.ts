import { prisma } from "@/server/prisma";
import type {
  CancelPublicHolidayInput,
  CreatePublicHolidayInput,
  PublicHolidayRecord,
  PublicHolidayPeriod,
  ReactivatePublicHolidayInput,
  UpdatePublicHolidayInput,
} from "./public-holiday.types";

/** `@db.Date` columns are returned as UTC-midnight `Date` objects. */
function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** UTC midnight for a `YYYY-MM-DD` value, the shape `@db.Date` expects. */
function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Relations joined so the API can report the acting users without a second request.
 * Prisma infers the payload type from this.
 */
const HOLIDAY_INCLUDE = {
  createdBy: { select: { username: true } },
  cancelledBy: { select: { username: true } },
};

interface PublicHolidayRow {
  holidayId: bigint;
  name: string;
  dateFrom: Date;
  dateTo: Date;
  reason: string | null;
  createdById: bigint;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelledById: bigint | null;
  cancellationReason: string | null;
  createdBy: { username: string };
  cancelledBy: { username: string } | null;
}

function toRecord(row: PublicHolidayRow): PublicHolidayRecord {
  return {
    holidayId: row.holidayId.toString(),
    name: row.name,
    dateFrom: toDateString(row.dateFrom),
    dateTo: toDateString(row.dateTo),
    reason: row.reason,
    createdById: row.createdById.toString(),
    createdByName: row.createdBy.username,
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancelledById: row.cancelledById ? row.cancelledById.toString() : null,
    cancelledByName: row.cancelledBy ? row.cancelledBy.username : null,
    cancellationReason: row.cancellationReason,
  };
}

/**
 * All public holiday records (both active and cancelled), newest first.
 */
export async function listPublicHolidays(): Promise<PublicHolidayRecord[]> {
  const rows = await prisma.publicHoliday.findMany({
    include: HOLIDAY_INCLUDE,
    orderBy: [{ dateFrom: "desc" }, { holidayId: "desc" }],
  });

  return rows.map(toRecord);
}

/**
 * All ACTIVE public holiday records (not cancelled), newest first.
 * Used by the attendance calculators.
 */
export async function listActivePublicHolidays(): Promise<PublicHolidayRecord[]> {
  const rows = await prisma.publicHoliday.findMany({
    where: { cancelledAt: null },
    include: HOLIDAY_INCLUDE,
    orderBy: [{ dateFrom: "desc" }, { holidayId: "desc" }],
  });

  return rows.map(toRecord);
}

/** One public holiday record with its audit relation, or null when it does not exist. */
export async function getPublicHoliday(
  holidayId: bigint,
): Promise<PublicHolidayRecord | null> {
  const row = await prisma.publicHoliday.findUnique({
    where: { holidayId },
    include: HOLIDAY_INCLUDE,
  });

  return row ? toRecord(row) : null;
}

/**
 * ACTIVE public holiday periods overlapping `[startDate, endDate]` for attendance calculation.
 *
 * Returns all holidays that cover any date in the range, used by the daily and monthly
 * attendance calculators to determine if a date falls within a public holiday.
 * Only non-cancelled holidays are included.
 */
export async function getPublicHolidaysForRange(
  startDate: string,
  endDate: string,
): Promise<PublicHolidayPeriod[]> {
  const rows = await prisma.publicHoliday.findMany({
    where: {
      cancelledAt: null,
      dateFrom: { lte: toDatabaseDate(endDate) },
      dateTo: { gte: toDatabaseDate(startDate) },
    },
    select: {
      holidayId: true,
      name: true,
      dateFrom: true,
      dateTo: true,
      reason: true,
    },
    orderBy: [{ dateFrom: "asc" }],
  });

  return rows.map((row) => ({
    holidayId: row.holidayId.toString(),
    name: row.name,
    dateFrom: toDateString(row.dateFrom),
    dateTo: toDateString(row.dateTo),
    reason: row.reason,
  }));
}

/** ACTIVE public holiday periods covering `date` (inclusive) - a one-day range. */
export function getPublicHolidaysForDate(
  date: string,
): Promise<PublicHolidayPeriod[]> {
  return getPublicHolidaysForRange(date, date);
}

export async function createPublicHoliday(
  input: CreatePublicHolidayInput,
): Promise<PublicHolidayRecord> {
  const created = await prisma.publicHoliday.create({
    data: {
      name: input.name,
      dateFrom: toDatabaseDate(input.dateFrom),
      dateTo: toDatabaseDate(input.dateTo),
      reason: input.reason,
      createdById: input.createdById,
    },
    include: HOLIDAY_INCLUDE,
  });

  return toRecord(created);
}

/**
 * Updates one public holiday record, modifying it in place.
 *
 * The holidayId must exist.
 */
export async function updatePublicHoliday(
  holidayId: bigint,
  input: UpdatePublicHolidayInput,
): Promise<PublicHolidayRecord | null> {
  const updated = await prisma.publicHoliday.update({
    where: { holidayId },
    data: {
      name: input.name,
      dateFrom: toDatabaseDate(input.dateFrom),
      dateTo: toDatabaseDate(input.dateTo),
      reason: input.reason,
    },
    include: HOLIDAY_INCLUDE,
  });

  return toRecord(updated);
}

/**
 * Cancels one ACTIVE public holiday record, keeping the original row.
 *
 * The `cancelledAt IS NULL` guard makes the update atomic: a second cancellation
 * matches no row and returns null instead of overwriting the first
 * cancellation's audit data.
 */
export async function cancelPublicHoliday(
  holidayId: bigint,
  input: CancelPublicHolidayInput,
): Promise<PublicHolidayRecord | null> {
  const result = await prisma.publicHoliday.updateMany({
    where: { holidayId, cancelledAt: null },
    data: {
      cancelledAt: new Date(),
      cancelledById: input.cancelledById,
      cancellationReason: input.reason,
    },
  });

  if (result.count === 0) return null;

  return getPublicHoliday(holidayId);
}

/**
 * Reactivates a CANCELLED public holiday record.
 *
 * Clears the cancellation fields to restore the holiday as ACTIVE.
 * The original cancellation audit information is preserved in the record's history.
 */
export async function reactivatePublicHoliday(
  holidayId: bigint,
  _input: ReactivatePublicHolidayInput,
): Promise<PublicHolidayRecord | null> {
  const result = await prisma.publicHoliday.updateMany({
    where: { holidayId, cancelledAt: { not: null } },
    data: {
      cancelledAt: null,
      cancelledById: null,
      cancellationReason: null,
    },
  });

  if (result.count === 0) return null;

  return getPublicHoliday(holidayId);
}
