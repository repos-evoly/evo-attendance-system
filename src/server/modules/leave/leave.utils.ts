/**
 * Pure helpers for employee leave periods.
 *
 * Both bounds are inclusive `YYYY-MM-DD` values, which compare correctly as
 * strings, so the range logic stays free of Date/timezone handling.
 */

/** A leave period with inclusive `dateFrom` / `dateTo` bounds. */
export interface LeaveRange {
  dateFrom: string;
  dateTo: string;
}

/**
 * True when the two inclusive ranges share at least one calendar day.
 *
 * Two ranges overlap unless one ends before the other starts, and touching
 * ranges (e.g. `2026-11-01`–`2026-11-03` and `2026-11-03`–`2026-11-05`) do
 * overlap because both contain `2026-11-03`.
 */
export function rangesOverlap(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

/** First existing period that overlaps `[dateFrom, dateTo]`, or null. */
export function findOverlappingLeave<T extends LeaveRange>(
  leaves: readonly T[],
  dateFrom: string,
  dateTo: string,
): T | null {
  for (const leave of leaves) {
    if (rangesOverlap(leave.dateFrom, leave.dateTo, dateFrom, dateTo)) {
      return leave;
    }
  }

  return null;
}

/** True when `date` falls inside the inclusive period. */
export function isDateWithinLeave(leave: LeaveRange, date: string): boolean {
  return date >= leave.dateFrom && date <= leave.dateTo;
}

/** True when any period in `leaves` covers `date`. */
export function isDateOnLeave(
  leaves: readonly LeaveRange[],
  date: string,
): boolean {
  return leaves.some((leave) => isDateWithinLeave(leave, date));
}
