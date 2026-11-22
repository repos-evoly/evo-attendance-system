const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates whether `value` is a valid calendar date string in YYYY-MM-DD format.
 * Rejects invalid format or nonexistent dates (e.g., 2026-02-31).
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Formats a Date object to YYYY-MM-DD string using UTC bounds to avoid timezone shift. */
export function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Converts a YYYY-MM-DD string to UTC midnight Date object for Prisma @db.Date. */
export function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export interface AssignmentRange {
  id?: string;
  startDate: string;
  endDate: string | null;
}

/**
 * Evaluates whether two date ranges share at least one calendar day (inclusive).
 * A null `endDate` represents an ongoing assignment extending indefinitely to +infinity.
 *
 * Rules:
 * - [2026-12-01, 2026-12-15] and [2026-12-15, 2026-12-31] overlap (both contain 2026-12-15).
 * - [2026-12-01, 2026-12-15] and [2026-12-16, 2026-12-31] do NOT overlap (adjacent).
 * - [2026-12-01, null] and [2026-12-10, 2026-12-20] overlap.
 * - [2026-12-01, null] and [2027-01-01, null] overlap.
 */
export function isShiftAssignmentOverlapping(
  startA: string,
  endA: string | null,
  startB: string,
  endB: string | null,
): boolean {
  const aStartsBeforeOrOnBEnd = endB === null || startA <= endB;
  const bStartsBeforeOrOnAEnd = endA === null || startB <= endA;

  return aStartsBeforeOrOnBEnd && bStartsBeforeOrOnAEnd;
}

/**
 * Finds the first overlapping assignment in a list of existing assignments,
 * optionally excluding a specific assignment ID (used when updating an existing assignment).
 */
export function findOverlappingAssignment<T extends AssignmentRange>(
  assignments: readonly T[],
  startDate: string,
  endDate: string | null,
  excludeId?: string,
): T | null {
  for (const a of assignments) {
    if (excludeId !== undefined && a.id === excludeId) {
      continue;
    }
    if (isShiftAssignmentOverlapping(startDate, endDate, a.startDate, a.endDate)) {
      return a;
    }
  }

  return null;
}
