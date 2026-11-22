import { describe, expect, it } from "vitest";
import { getWorkProgress, getWorkProgressLabel } from "./attendance.utils";
import type { DailyAttendanceRow } from "@/types/attendance/daily-attendance.types";

function createRow(
  status: DailyAttendanceRow["status"],
  checkIn: string | null = null,
  checkOut: string | null = null,
): DailyAttendanceRow {
  return {
    employeeId: 1,
    fullName: "Test Employee",
    shiftName: "Morning Shift",
    checkIn,
    checkOut,
    punchCount: checkIn ? (checkOut ? 2 : 1) : 0,
    workedMinutes: checkIn && checkOut ? 360 : null,
    lateMinutes: 0,
    status,
    requiredMinutes: 360,
    actualMinutes: checkIn && checkOut ? 360 : null,
    missingMinutes: checkIn && checkOut ? 0 : null,
    effectiveStart: checkIn ? "09:00" : null,
    waiver: false,
    leave: null,
  };
}

describe("getWorkProgress", () => {
  it("returns 'in_progress' for IN_PROGRESS status", () => {
    const row = createRow("IN_PROGRESS", "09:00", null);
    expect(getWorkProgress(row)).toBe("in_progress");
  });

  it("returns 'completed' for PRESENT with both punches", () => {
    const row = createRow("PRESENT", "09:00", "15:00");
    expect(getWorkProgress(row)).toBe("completed");
  });

  it("returns 'in_progress' for PRESENT with only check-in", () => {
    const row = createRow("PRESENT", "09:00", null);
    expect(getWorkProgress(row)).toBe("in_progress");
  });

  it("returns 'completed' for LATE with both punches", () => {
    const row = createRow("LATE", "09:20", "15:00");
    row.lateMinutes = 20;
    expect(getWorkProgress(row)).toBe("completed");
  });

  it("returns 'in_progress' for LATE with only check-in", () => {
    const row = createRow("LATE", "09:20", null);
    row.lateMinutes = 20;
    expect(getWorkProgress(row)).toBe("in_progress");
  });

  it("returns 'missing_in' for MISSING_IN status", () => {
    const row = createRow("MISSING_IN", null, "15:00");
    expect(getWorkProgress(row)).toBe("missing_in");
  });

  it("returns 'missing_out' for MISSING_OUT status", () => {
    const row = createRow("MISSING_OUT", "09:00", null);
    expect(getWorkProgress(row)).toBe("missing_out");
  });

  it("returns 'absent' for ABSENT status", () => {
    const row = createRow("ABSENT", null, null);
    expect(getWorkProgress(row)).toBe("absent");
  });

  it("returns 'pending' for PENDING status", () => {
    const row = createRow("PENDING", null, null);
    expect(getWorkProgress(row)).toBe("pending");
  });
});

describe("getWorkProgressLabel", () => {
  it("returns correct label for in_progress", () => {
    expect(getWorkProgressLabel("in_progress")).toBe("In Progress");
  });

  it("returns correct label for completed", () => {
    expect(getWorkProgressLabel("completed")).toBe("Completed");
  });

  it("returns correct label for pending", () => {
    expect(getWorkProgressLabel("pending")).toBe("Pending");
  });

  it("returns correct label for absent", () => {
    expect(getWorkProgressLabel("absent")).toBe("Absent");
  });

  it("returns correct label for missing_in", () => {
    expect(getWorkProgressLabel("missing_in")).toBe("Missing Check-In");
  });

  it("returns correct label for missing_out", () => {
    expect(getWorkProgressLabel("missing_out")).toBe("Missing Check-Out");
  });
});
