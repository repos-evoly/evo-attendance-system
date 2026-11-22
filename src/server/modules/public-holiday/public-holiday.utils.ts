/**
 * Pure helpers for public holiday periods.
 *
 * Both bounds are inclusive `YYYY-MM-DD` values, which compare correctly as
 * strings, so the range logic stays free of Date/timezone handling.
 */

/** A public holiday period with inclusive `dateFrom` / `dateTo` bounds. */
export interface HolidayRange {
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
export function findOverlappingHoliday<T extends HolidayRange>(
  holidays: readonly T[],
  dateFrom: string,
  dateTo: string,
): T | null {
  for (const holiday of holidays) {
    if (rangesOverlap(holiday.dateFrom, holiday.dateTo, dateFrom, dateTo)) {
      return holiday;
    }
  }

  return null;
}

/** True when `date` falls inside the inclusive period. */
export function isDateWithinHoliday(holiday: HolidayRange, date: string): boolean {
  return date >= holiday.dateFrom && date <= holiday.dateTo;
}

/** True when any period in `holidays` covers `date`. */
export function isDateOnHoliday(
  holidays: readonly HolidayRange[],
  date: string,
): boolean {
  return holidays.some((holiday) => isDateWithinHoliday(holiday, date));
}
