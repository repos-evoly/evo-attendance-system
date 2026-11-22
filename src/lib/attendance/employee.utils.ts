import type { Employee, Shift } from "@/types/attendance/employee.types";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const PLACEHOLDER = "—";

/**
 * Two-letter initials from a full name. Handles single names and names with
 * more than two parts, and returns "?" when there is nothing usable.
 */
export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";

  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] ?? "" : "";

  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
}

/**
 * Formats an ISO date string such as "2024-01-15T00:00:00.000Z" into
 * "15 Jan 2024". Parsing is string-based (no locale/timezone access) so the
 * output is identical on the server and the client.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return PLACEHOLDER;

  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-");

  if (!year || !month || !day) return value;

  const monthLabel = MONTH_LABELS[Number(month) - 1];

  return monthLabel ? `${day} ${monthLabel} ${year}` : value;
}

/**
 * Extracts an "HH:MM" clock time from a serialized TIME value, e.g.
 * "1970-01-01T09:00:00.000Z" -> "09:00".
 */
export function formatShiftTime(value: string | null | undefined): string {
  if (!value) return PLACEHOLDER;

  const isoTail = /T(\d{2}:\d{2})/.exec(value);
  if (isoTail?.[1]) return isoTail[1];

  const plainHead = /^(\d{2}:\d{2})/.exec(value);
  return plainHead?.[1] ?? value;
}

/** "09:00 – 15:00" for a shift. */
export function formatShiftSchedule(shift: Shift): string {
  return `${formatShiftTime(shift.timeIn)} – ${formatShiftTime(shift.timeOut)}`;
}

export function buildShiftLookup(shifts: Shift[]): Map<number, Shift> {
  return new Map(shifts.map((shift) => [shift.shiftId, shift]));
}

export function getShift(
  lookup: Map<number, Shift>,
  shiftId: number | null | undefined
): Shift | null {
  if (shiftId == null) return null;

  return lookup.get(shiftId) ?? null;
}

/**
 * Human readable shift label. Falls back to "Shift #id" when the shift list
 * could not be loaded, and to null when no shift is assigned.
 */
export function getShiftName(
  lookup: Map<number, Shift>,
  shiftId: number | null | undefined
): string | null {
  if (shiftId == null) return null;

  return lookup.get(shiftId)?.name ?? `Shift #${shiftId}`;
}

/** Case-insensitive match on full name or employee ID. */
export function matchesEmployeeQuery(
  employee: Employee,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return (
    employee.fullName.toLowerCase().includes(needle) ||
    String(employee.employeeId).includes(needle)
  );
}
