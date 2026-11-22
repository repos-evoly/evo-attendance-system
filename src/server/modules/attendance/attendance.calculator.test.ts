
import { describe, expect, it } from "vitest";
import {
  calculateDailyAttendance,
  type AttendanceStatus,
} from "./attendance.calculator";

import type {
  AttendanceEmployee,
  AttendancePunch,
} from "./attendance.repository";

const DATE = "2026-11-05"; // Thursday

const employee: AttendanceEmployee = {
  employeeId: 1,
  fullName: "Test Employee",
  shiftId: 1,
  shiftName: "Morning Shift",
  timeIn: "09:00:00",
  timeOut: "15:00:00",
  allowanceMinutes: 15,
};

function punch(
  deviceUserId: string,
  punchedAtLocal: string,
  punchType: number = 0,
): AttendancePunch {
  return { deviceUserId, punchedAtLocal, punchType };
}

function calculate(
  punches: AttendancePunch[],
  now = `${DATE}T16:00:00.000`,
) {
  return calculateDailyAttendance({
    date: DATE,
    employees: [employee],
    punches,
    now,
  });
}

describe("calculateDailyAttendance", () => {
  it("calculates check-in, check-out and worked minutes", () => {
    const result = calculate([
      punch("1", `${DATE} 09:00:00`, 0), // IN
      punch("1", `${DATE} 15:00:00`, 1), // OUT
    ]);

    expect(result[0]).toMatchObject({
      employeeId: 1,
      checkIn: "09:00",
      checkOut: "15:00",
      punchCount: 2,
      workedMinutes: 360,
      lateMinutes: 0,
      status: "PRESENT",
    });
  });

  it("uses the earliest IN and latest OUT punches", () => {
    const result = calculate([
      punch("1", `${DATE} 15:10:00`, 1), // OUT
      punch("1", `${DATE} 09:05:00`, 0), // IN
      punch("1", `${DATE} 12:00:00`, 0), // IN
    ]);

    expect(result[0]?.checkIn).toBe("09:05");
    expect(result[0]?.checkOut).toBe("15:10");
    expect(result[0]?.punchCount).toBe(3);
    expect(result[0]?.workedMinutes).toBe(365);
  });

  it("marks one IN punch as MISSING_OUT after today's shift has ended", () => {
    const result = calculate([
      punch("1", `${DATE} 09:10:00`, 0), // IN
    ]);

    expect(result[0]).toMatchObject({
      checkIn: "09:10",
      checkOut: null,
      punchCount: 1,
      workedMinutes: null,
      status: "MISSING_OUT",
    });
  });

  it("does not invent worked minutes for a missing check-out", () => {
    const result = calculate([
      punch("1", `${DATE} 09:10:00`, 0), // IN
    ]);

    expect(result[0]?.actualMinutes).toBeNull();
    expect(result[0]?.missingMinutes).toBeNull();
  });

  it("keeps IN_PROGRESS for today's IN-only attendance while the shift is ongoing", () => {
    const result = calculate(
      [punch("1", `${DATE} 09:06:00`, 0)], // IN
      `${DATE}T10:00:00.000`, // same day, before the 15:00 shift end
    );

    expect(result[0]).toMatchObject({
      checkIn: "09:06",
      checkOut: null,
      punchCount: 1,
      workedMinutes: null,
      actualMinutes: null,
      missingMinutes: null,
      status: "IN_PROGRESS",
    });
  });

  it("marks a past working day with IN but no OUT as MISSING_OUT", () => {
    const pastDate = "2026-11-04"; // Wednesday

    const result = calculateDailyAttendance({
      date: pastDate,
      employees: [employee],
      punches: [punch("1", `${pastDate} 09:06:00`, 0)], // IN
      now: `${DATE}T16:00:00.000`,
    });

    expect(result[0]).toMatchObject({
      checkIn: "09:06",
      checkOut: null,
      workedMinutes: null,
      actualMinutes: null,
      missingMinutes: null,
      status: "MISSING_OUT",
    });
  });

  it("keeps MISSING_IN for a past working day with OUT but no IN", () => {
    const pastDate = "2026-11-04"; // Wednesday

    const result = calculateDailyAttendance({
      date: pastDate,
      employees: [employee],
      punches: [punch("1", `${pastDate} 16:10:00`, 1)], // OUT
      now: `${DATE}T16:00:00.000`,
    });

    expect(result[0]).toMatchObject({
      checkIn: null,
      checkOut: "16:10",
      workedMinutes: null,
      lateMinutes: 0,
      status: "MISSING_IN",
    });
  });

  it("marks a future working day without punches as PENDING", () => {
    const futureDate = "2026-11-09"; // Monday

    const result = calculateDailyAttendance({
      date: futureDate,
      employees: [employee],
      punches: [],
      now: `${DATE}T16:00:00.000`,
    });

    expect(result[0]?.status).toBe("PENDING");
  });

  it("marks one OUT punch as MISSING_IN with zero late minutes", () => {
    const result = calculate([
      punch("1", `${DATE} 17:00:00`, 1), // OUT only
    ]);

    expect(result[0]).toMatchObject({
      checkIn: null,
      checkOut: "17:00",
      punchCount: 1,
      workedMinutes: null,
      lateMinutes: 0,
      status: "MISSING_IN",
    });
  });

  it("calculates late minutes for one IN punch within allowance", () => {
    const result = calculate([
      punch("1", `${DATE} 09:10:00`, 0), // IN
    ]);

    expect(result[0]).toMatchObject({
      status: "MISSING_OUT",
      lateMinutes: 0,
    });
  });

  it("calculates late minutes for one IN punch at allowance boundary", () => {
    const result = calculate([
      punch("1", `${DATE} 09:15:00`, 0), // IN
    ]);

    expect(result[0]).toMatchObject({
      status: "MISSING_OUT",
      lateMinutes: 0,
    });
  });

  it("calculates late minutes for one IN punch after allowance", () => {
    const result = calculate([
      punch("1", `${DATE} 09:20:00`, 0), // IN
    ]);

    expect(result[0]).toMatchObject({
      status: "MISSING_OUT",
      lateMinutes: 20,
    });
  });

  it("calculates late minutes for one IN punch significantly late", () => {
    const result = calculate([
      punch("1", `${DATE} 09:30:00`, 0), // IN
    ]);

    expect(result[0]).toMatchObject({
      status: "MISSING_OUT",
      lateMinutes: 30,
    });
  });

  it("does not mark an employee late within the allowance", () => {
    const result = calculate([
      punch("1", `${DATE} 09:10:00`, 0), // IN
      punch("1", `${DATE} 15:00:00`, 1), // OUT
    ]);

    expect(result[0]?.lateMinutes).toBe(0);
    expect(result[0]?.status).toBe("PRESENT");
  });

  it("calculates full late minutes after the allowance", () => {
    const result = calculate([
      punch("1", `${DATE} 09:20:00`, 0), // IN
      punch("1", `${DATE} 15:00:00`, 1), // OUT
    ]);

    expect(result[0]?.lateMinutes).toBe(20);
    expect(result[0]?.status).toBe("LATE");
  });

  it("marks an employee PENDING before shift start + allowance without punches", () => {
    const result = calculate(
      [],
      `${DATE}T09:10:00.000`,
    );

    expect(result[0]?.status).toBe("PENDING");
  });

  it("marks an employee PENDING at shift start + allowance boundary without punches", () => {
    const result = calculate(
      [],
      `${DATE}T09:15:00.000`,
    );

    expect(result[0]?.status).toBe("PENDING");
  });

  it("marks an employee ABSENT after shift start + allowance without punches", () => {
    const result = calculate(
      [],
      `${DATE}T09:16:00.000`,
    );

    expect(result[0]?.status).toBe("ABSENT");
  });

  it("marks an employee ABSENT after shift end without punches", () => {
    const result = calculate(
      [],
      `${DATE}T16:00:00.000`,
    );

    expect(result[0]?.status).toBe("ABSENT");
  });

  it("calculates IN_PROGRESS with late minutes when checking in after grace period", () => {
    const result = calculate(
      [punch("1", `${DATE} 09:20:00`, 0)], // IN late (after 09:15 allowance)
      `${DATE}T10:00:00.000`,
    );
    expect(result[0]?.status).toBe("IN_PROGRESS");
    expect(result[0]?.lateMinutes).toBe(20);
  });

  it("calculates IN_PROGRESS with zero late minutes when checking in within grace period", () => {
    const result = calculate(
      [punch("1", `${DATE} 09:10:00`, 0)], // IN within allowance
      `${DATE}T10:00:00.000`,
    );
    expect(result[0]?.status).toBe("IN_PROGRESS");
    expect(result[0]?.lateMinutes).toBe(0);
  });

  it("marks an employee ABSENT on a past working day without punches", () => {
    const result = calculate(
      [],
      "2026-11-06T16:00:00.000",
    );

    // This test uses DATE (Thursday), which is before Friday.
    expect(result[0]?.status).toBe("ABSENT");
  });

  it.each([
    ["2026-11-06", "Friday"],
    ["2026-11-07", "Saturday"],
  ])("marks %s as WEEKEND", (date) => {
    const result = calculateDailyAttendance({
      date,
      employees: [employee],
      punches: [],
      now: `${date}T12:00:00.000`,
    });

    expect(result[0]?.status).toBe("WEEKEND");
  });

  it("marks employees without a shift as NO_SHIFT", () => {
    const employeeWithoutShift: AttendanceEmployee = {
      ...employee,
      shiftId: null,
      shiftName: null,
      timeIn: null,
      timeOut: null,
      allowanceMinutes: null,
    };

    const result = calculateDailyAttendance({
      date: DATE,
      employees: [employeeWithoutShift],
      punches: [],
      now: `${DATE}T10:00:00.000`,
    });

    expect(result[0]?.status).toBe("NO_SHIFT");
  });

  it("returns all employees even when they have no punches", () => {
    const secondEmployee: AttendanceEmployee = {
      ...employee,
      employeeId: 2,
      fullName: "Second Employee",
    };

    const result = calculateDailyAttendance({
      date: DATE,
      employees: [employee, secondEmployee],
      punches: [],
      now: `${DATE}T09:00:00.000`,
    });

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.employeeId)).toEqual([1, 2]);
    expect(result.every((row) => row.status === "PENDING")).toBe(true);
  });

  it("ignores punches belonging to another date", () => {
    const result = calculate([
      punch("1", "2026-11-04 09:00:00", 0),
      punch("1", "2026-11-04 15:00:00", 1),
    ]);

    expect(result[0]?.punchCount).toBe(0);
    expect(result[0]?.status).toBe("ABSENT");
  });

  it("handles OUT followed by IN by using first IN and last OUT", () => {
    const result = calculate([
      punch("1", `${DATE} 08:00:00`, 1), // OUT (before IN)
      punch("1", `${DATE} 09:05:00`, 0), // IN
      punch("1", `${DATE} 15:00:00`, 1), // OUT
    ]);

    expect(result[0]).toMatchObject({
      checkIn: "09:05",
      checkOut: "15:00",
      punchCount: 3,
      workedMinutes: 355,
      lateMinutes: 0,
      status: "PRESENT",
    });
  });

  it("handles multiple IN and OUT punches by using first IN and last OUT", () => {
    const result = calculate([
      punch("1", `${DATE} 09:00:00`, 0), // IN
      punch("1", `${DATE} 09:05:00`, 0), // IN (duplicate)
      punch("1", `${DATE} 14:55:00`, 1), // OUT
      punch("1", `${DATE} 15:00:00`, 1), // OUT (duplicate)
    ]);

    expect(result[0]).toMatchObject({
      checkIn: "09:00",
      checkOut: "15:00",
      punchCount: 4,
      workedMinutes: 360,
      lateMinutes: 0,
      status: "PRESENT",
    });
  });

  it("handles multiple IN punches without OUT as MISSING_OUT on a closed day", () => {
    const result = calculate([
      punch("1", `${DATE} 09:00:00`, 0), // IN
      punch("1", `${DATE} 09:05:00`, 0), // IN
    ]);

    expect(result[0]).toMatchObject({
      checkIn: "09:00",
      checkOut: null,
      punchCount: 2,
      workedMinutes: null,
      status: "MISSING_OUT",
    });
  });

  it("handles multiple OUT punches without IN as MISSING_IN", () => {
    const result = calculate([
      punch("1", `${DATE} 15:00:00`, 1), // OUT
      punch("1", `${DATE} 15:05:00`, 1), // OUT
    ]);

    expect(result[0]).toMatchObject({
      checkIn: null,
      checkOut: "15:05",
      punchCount: 2,
      workedMinutes: null,
      lateMinutes: 0,
      status: "MISSING_IN",
    });
  });

  it("credits a late arrival as a full PRESENT day when a waiver is stored", () => {
    const waivers = new Map<string, boolean>([[`1|${DATE}`, true]]);

    const result = calculateDailyAttendance({
      date: DATE,
      employees: [employee],
      punches: [
        punch("1", `${DATE} 09:20:00`, 0), // IN (late)
        punch("1", `${DATE} 15:00:00`, 1), // OUT
      ],
      now: `${DATE}T16:00:00.000`,
      waivers,
    });

    expect(result[0]).toMatchObject({
      status: "PRESENT",
      lateMinutes: 0,
      actualMinutes: 360,
      missingMinutes: 0,
      waiver: true,
      // The waiver never rewrites device punches.
      checkIn: "09:20",
      checkOut: "15:00",
      punchCount: 2,
    });
  });

  it("credits a closed MISSING_OUT day when a waiver is stored", () => {
    const pastDate = "2026-11-04"; // Wednesday
    const waivers = new Map<string, boolean>([[`1|${pastDate}`, true]]);

    const result = calculateDailyAttendance({
      date: pastDate,
      employees: [employee],
      punches: [punch("1", `${pastDate} 09:06:00`, 0)], // IN only
      now: `${DATE}T16:00:00.000`,
      waivers,
    });

    expect(result[0]).toMatchObject({
      status: "PRESENT",
      lateMinutes: 0,
      actualMinutes: 360,
      missingMinutes: 0,
      waiver: true,
      checkIn: "09:06",
      checkOut: null,
      punchCount: 1,
    });
  });

  it("credits a closed MISSING_IN day when a waiver is stored", () => {
    const pastDate = "2026-11-04"; // Wednesday
    const waivers = new Map<string, boolean>([[`1|${pastDate}`, true]]);

    const result = calculateDailyAttendance({
      date: pastDate,
      employees: [employee],
      punches: [punch("1", `${pastDate} 15:10:00`, 1)], // OUT only
      now: `${DATE}T16:00:00.000`,
      waivers,
    });

    expect(result[0]).toMatchObject({
      status: "PRESENT",
      lateMinutes: 0,
      actualMinutes: 360,
      missingMinutes: 0,
      waiver: true,
      checkIn: null,
      checkOut: "15:10",
      punchCount: 1,
    });
  });

  it("does not finalize an ongoing IN_PROGRESS day with a waiver", () => {
    const waivers = new Map<string, boolean>([[`1|${DATE}`, true]]);

    const result = calculateDailyAttendance({
      date: DATE,
      employees: [employee],
      punches: [punch("1", `${DATE} 09:06:00`, 0)], // IN only, shift still running
      now: `${DATE}T10:00:00.000`,
      waivers,
    });

    expect(result[0]).toMatchObject({
      status: "IN_PROGRESS",
      lateMinutes: 0,
      actualMinutes: null,
      missingMinutes: null,
    });
  });

  it("keeps the LATE status when the waiver is revoked", () => {
    const waivers = new Map<string, boolean>([[`1|${DATE}`, false]]);

    const result = calculateDailyAttendance({
      date: DATE,
      employees: [employee],
      punches: [
        punch("1", `${DATE} 09:20:00`, 0), // IN (late)
        punch("1", `${DATE} 15:00:00`, 1), // OUT
      ],
      now: `${DATE}T16:00:00.000`,
      waivers,
    });

    expect(result[0]).toMatchObject({
      status: "LATE",
      lateMinutes: 20,
      actualMinutes: 340,
      missingMinutes: 20,
      waiver: false,
    });
  });

  describe("timezone handling (Libya UTC+02:00)", () => {
    it("marks PENDING exactly at shift start + allowance (09:15:00)", () => {
      const result = calculate(
        [],
        `${DATE}T09:15:00.000`,
      );

      expect(result[0]?.status).toBe("PENDING");
    });

    it("marks ABSENT one second after shift start + allowance (09:15:01)", () => {
      const result = calculate(
        [],
        `${DATE}T09:15:01.000`,
      );

      expect(result[0]?.status).toBe("ABSENT");
    });

    it("marks LATE when checking in after 09:15:00", () => {
      const result = calculate([
        punch("1", `${DATE} 09:16:00`, 0), // IN after allowance
        punch("1", `${DATE} 15:00:00`, 1), // OUT
      ]);

      expect(result[0]?.status).toBe("LATE");
      expect(result[0]?.lateMinutes).toBe(16);
    });

    it("detects MISSING_OUT using correct local shift end time", () => {
      const result = calculate([
        punch("1", `${DATE} 09:00:00`, 0), // IN
      ]);

      // Current time is 16:00, which is after shift end (15:00)
      expect(result[0]?.status).toBe("MISSING_OUT");
    });

    it("keeps IN_PROGRESS when current time is before local shift end", () => {
      const result = calculate(
        [punch("1", `${DATE} 09:00:00`, 0)], // IN
        `${DATE}T14:59:59.000`, // Before shift end (15:00)
      );

      expect(result[0]?.status).toBe("IN_PROGRESS");
    });

    it("transitions to MISSING_OUT when current time passes local shift end", () => {
      const result = calculate(
        [punch("1", `${DATE} 09:00:00`, 0)], // IN
        `${DATE}T15:00:01.000`, // After shift end (15:00)
      );

      expect(result[0]?.status).toBe("MISSING_OUT");
    });
  });
});
