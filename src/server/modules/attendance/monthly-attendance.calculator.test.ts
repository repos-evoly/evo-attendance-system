import { describe, expect, it, vi } from "vitest";
import {
  calculateMonthlyAttendance,
  calculateMonthlyDailyRecords,
  getLibyaToday,
} from "./monthly-attendance.calculator";

import type {
  AttendanceEmployee,
  AttendancePunch,
} from "./attendance.repository";

const MONTH = "2026-11";

const employee: AttendanceEmployee = {
  employeeId: 1,
  fullName: "Test Employee",
  shiftId: 1,
  shiftName: "Morning Shift",
  timeIn: "09:00:00",
  timeOut: "15:00:00",
  allowanceMinutes: 15,
};

const employee2: AttendanceEmployee = {
  employeeId: 2,
  fullName: "Second Employee",
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

describe("calculateMonthlyAttendance", () => {
  it("returns all employees with ABSENT days counted", () => {
    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches: [],
    });

    expect(result).toHaveLength(1);
    // With no punches, all past non-weekend days are ABSENT
    // November 2026 has weekdays that should be counted as ABSENT
    expect(result[0]).toMatchObject({
      employeeId: 1,
      fullName: "Test Employee",
      lateDays: 0,
      reviewDays: 0,
      requiredMinutes: expect.any(Number),
      actualMinutes: 0,
      missingMinutes: expect.any(Number),
      workedHours: 0,
      missingHours: expect.any(Number),
    });
    // Verify ABSENT logic: actual = 0, missing = required for every closed day.
    // Required Hours also include the current day while it is still open, so
    // missing is at most required, never more.
    if (result[0]) {
      expect(result[0].missingMinutes).toBeGreaterThan(0);
      expect(result[0].missingMinutes).toBeLessThanOrEqual(result[0].requiredMinutes);
    }
  });

  it("aggregates late days across multiple days", () => {
    const punches = [
      punch("1", "2026-11-03 09:20:00", 0), // IN (Monday)
      punch("1", "2026-11-03 15:00:00", 1), // OUT
      punch("1", "2026-11-04 09:28:00", 0), // IN (Tuesday)
      punch("1", "2026-11-04 15:00:00", 1), // OUT
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    // Days 3 and 4 have punches, other past non-weekend days are ABSENT
    expect(result[0]).toMatchObject({
      employeeId: 1,
      lateDays: 2,
      reviewDays: 0,
      requiredMinutes: expect.any(Number), // Will include ABSENT days
      actualMinutes: expect.any(Number), // Will include actual from days 3 and 4
      missingMinutes: expect.any(Number), // Will include late minutes + ABSENT days
      workedHours: expect.any(Number),
      missingHours: expect.any(Number),
    });
    // Verify that actual + missing = required for the closed days. The current
    // day is still open, so it only contributes to Required Hours.
    if (result[0]) {
      const finalized = result[0].actualMinutes + result[0].missingMinutes;
      expect(finalized).toBeGreaterThan(0);
      expect(finalized).toBeLessThanOrEqual(result[0].requiredMinutes);
    }
  });

  it("calculates worked and missing hours correctly", () => {
    const punches = [
      punch("1", "2026-11-02 09:20:00", 0),
      punch("1", "2026-11-02 15:00:00", 1),
      punch("1", "2026-11-03 09:20:00", 0),
      punch("1", "2026-11-03 15:00:00", 1),
      punch("1", "2026-11-04 09:20:00", 0),
      punch("1", "2026-11-04 15:00:00", 1),
      punch("1", "2026-11-05 09:20:00", 0),
      punch("1", "2026-11-05 15:00:00", 1),
      punch("1", "2026-11-09 09:20:00", 0),
      punch("1", "2026-11-09 15:00:00", 1),
      punch("1", "2026-11-10 09:20:00", 0),
      punch("1", "2026-11-10 15:00:00", 1),
      punch("1", "2026-11-11 09:20:00", 0),
      punch("1", "2026-11-11 15:00:00", 1),
      punch("1", "2026-11-12 09:20:00", 0),
      punch("1", "2026-11-12 15:00:00", 1),
      punch("1", "2026-11-16 09:20:00", 0),
      punch("1", "2026-11-16 15:00:00", 1),
      punch("1", "2026-11-17 09:20:00", 0),
      punch("1", "2026-11-17 15:00:00", 1),
      punch("1", "2026-11-18 09:20:00", 0),
      punch("1", "2026-11-18 15:00:00", 1),
      punch("1", "2026-11-19 09:20:00", 0),
      punch("1", "2026-11-19 15:00:00", 1),
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    // These days are late (weekdays except weekends), ABSENT days not counted
    if (result[0]) {
      expect(result[0].lateDays).toBeGreaterThan(0);
      expect(result[0].reviewDays).toBe(0);
      expect(result[0].requiredMinutes).toBeGreaterThan(0);
      expect(result[0].actualMinutes).toBeGreaterThan(0);
      expect(result[0].missingMinutes).toBeGreaterThan(0);
      // Verify that actual + missing = required for the closed days. The current
      // day is still open, so it only contributes to Required Hours.
      const finalized = result[0].actualMinutes + result[0].missingMinutes;
      expect(finalized).toBeGreaterThan(0);
      expect(finalized).toBeLessThanOrEqual(result[0].requiredMinutes);
    }
  });

  it("does not count weekends as late days or totals", () => {
    const punches = [
      punch("1", "2026-11-07 09:20:00", 0), // Friday (weekend)
      punch("1", "2026-11-07 15:00:00", 1),
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    // Weekends are skipped entirely
    if (result[0]) {
      expect(result[0].lateDays).toBe(0);
    }
  });

  it("handles multiple employees correctly", () => {
    const punches = [
      punch("1", "2026-11-03 09:20:00", 0),
      punch("1", "2026-11-03 15:00:00", 1),
      punch("2", "2026-11-04 09:28:00", 0),
      punch("2", "2026-11-04 15:00:00", 1),
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee, employee2],
      punches,
    });

    expect(result).toHaveLength(2);
    if (result[0]) {
      expect(result[0].employeeId).toBe(1);
      expect(result[0].lateDays).toBeGreaterThan(0);
    }
    if (result[1]) {
      expect(result[1].employeeId).toBe(2);
      expect(result[1].lateDays).toBeGreaterThan(0);
    }
  });

  it("reports equal Required Hours for employees with and without today's punches", () => {
    // Pin "now" to the middle of the shift so the scenario is deterministic:
    // 2026-11-15 is a Sunday, and only Friday/Saturday are weekends.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T10:00:00.000Z"));

    try {
      const punches = [
        punch("1", "2026-11-15 09:05:00", 0), // employee 1 has checked in today
      ];

      const result = calculateMonthlyAttendance({
        month: MONTH,
        employees: [employee, employee2],
        punches,
      });

      const withTodaysPunch = result.find((row) => row.employeeId === 1);
      const withoutTodaysPunch = result.find((row) => row.employeeId === 2);

      // Same shift and same eligibility, so Required Hours must match even though
      // today is IN_PROGRESS for one employee and PENDING for the other.
      expect(withTodaysPunch?.reviewDays).toBe(1); // IN_PROGRESS today
      expect(withoutTodaysPunch?.reviewDays).toBe(0); // PENDING today
      expect(withTodaysPunch?.requiredMinutes).toBe(withoutTodaysPunch?.requiredMinutes);
      // 11 scheduled working days (01-05, 08-12, 15) x 360 minutes.
      expect(withTodaysPunch?.requiredMinutes).toBe(3960);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an IN-only day that is not closed does not count as late days, only as review days", () => {
    const punches = [
      punch("1", "2026-11-03 09:30:00", 0),
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    if (result[0]) {
      expect(result[0].lateDays).toBe(0); // IN_PROGRESS marked for review, not late
      expect(result[0].reviewDays).toBe(1);
      // IN_PROGRESS doesn't count minutes
      expect(result[0].actualMinutes).toBe(0);
      expect(result[0].missingMinutes).toBeGreaterThan(0); // ABSENT days counted
    }
  });

  it("does not count an IN-only day with zero late minutes as late days, but counts as review", () => {
    const punches = [
      punch("1", "2026-11-03 09:10:00", 0),
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    if (result[0]) {
      expect(result[0].lateDays).toBe(0);
      expect(result[0].reviewDays).toBe(1);
      expect(result[0].actualMinutes).toBe(0);
    }
  });

  it("aggregates LATE late days correctly, an incomplete IN-only day only counts as review", () => {
    const punches = [
      punch("1", "2026-11-03 09:20:00", 0),
      punch("1", "2026-11-03 15:00:00", 1),
      punch("1", "2026-11-04 09:30:00", 0),
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    if (result[0]) {
      expect(result[0].lateDays).toBe(1); // Only day 3 (LATE) counts, day 4 (IN_PROGRESS) is review only
      expect(result[0].reviewDays).toBe(1);
      expect(result[0].actualMinutes).toBeGreaterThan(0); // Day 3 has actual
    }
  });

  it("handles ABSENT with full required and missing minutes", () => {
    const punches = [
      punch("1", "2026-11-03 09:20:00", 0),
      punch("1", "2026-11-03 15:00:00", 1),
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    // Day 3 is late, other days are ABSENT
    if (result[0]) {
      expect(result[0].lateDays).toBeGreaterThan(0);
      // ABSENT logic: actual from day 3, missing includes late + ABSENT days
      expect(result[0].actualMinutes).toBeGreaterThan(0); // From day 3
      expect(result[0].missingMinutes).toBeGreaterThan(0);
    }
  });

  it("validates month format", () => {
    expect(() => {
      calculateMonthlyAttendance({
        month: "invalid",
        employees: [employee],
        punches: [],
      });
    }).toThrow("Invalid month format");
  });

  it("returns correct number of late days", () => {
    const punches = [
      punch("1", "2026-11-03 09:20:00", 0),
      punch("1", "2026-11-03 15:00:00", 1),
      punch("1", "2026-11-04 09:28:00", 0),
      punch("1", "2026-11-04 15:00:00", 1),
      punch("1", "2026-11-05 09:20:00", 0),
      punch("1", "2026-11-05 15:00:00", 1),
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    expect(result[0]?.lateDays).toBe(3);
  });

  it("counts MISSING_IN as review days, not late days", () => {
    const punches = [
      punch("1", "2026-11-03 15:00:00", 1), // OUT only
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    expect(result[0]?.lateDays).toBe(0);
    expect(result[0]?.reviewDays).toBe(1);
    expect(result[0]?.actualMinutes).toBe(0);
  });

  it("counts unwaived MISSING_OUT and MISSING_IN days as review days and full missing minutes", () => {
    const punches = [
      punch("1", "2026-11-03 09:30:00", 0), // IN only on a closed day -> MISSING_OUT
      punch("1", "2026-11-04 15:00:00", 1), // OUT only -> MISSING_IN
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    if (result[0]) {
      expect(result[0].reviewDays).toBe(2);
      // Incomplete days are review cases: never late days, never guessed hours.
      expect(result[0].lateDays).toBe(0);
      expect(result[0].actualMinutes).toBe(0);
      // A missing check-out still counts as a scheduled working day.
      expect(result[0].requiredMinutes).toBeGreaterThan(0);
      // Both unwaived review days count their full scheduled duration as missing.
      expect(result[0].missingMinutes).toBeGreaterThanOrEqual(720);
    }
  });

  it("does not count a waived review day as a review day", () => {
    const punches = [
      punch("1", "2026-11-03 09:30:00", 0), // IN only on a closed day -> MISSING_OUT
    ];

    const waivers = new Map<string, boolean>();
    waivers.set("1|2026-11-03", true);

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
      waivers,
    });

    if (result[0]) {
      expect(result[0].reviewDays).toBe(0);
      expect(result[0].lateDays).toBe(0);
      // The waived day is credited as a full scheduled day.
      expect(result[0].actualMinutes).toBeGreaterThanOrEqual(360);
    }
  });

  it("counts MISSING_IN as review and full missing minutes", () => {
    const punches = [
      punch("1", "2026-11-03 09:20:00", 0), // IN (late)
      punch("1", "2026-11-03 15:00:00", 1), // OUT
      punch("1", "2026-11-04 15:00:00", 1), // OUT only (MISSING_IN)
      punch("1", "2026-11-05 09:30:00", 0), // IN (late)
      punch("1", "2026-11-05 15:00:00", 1), // OUT
    ];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
    });

    if (result[0]) {
      expect(result[0].lateDays).toBe(2); // Days 3 and 5 are LATE
      expect(result[0].reviewDays).toBe(1); // Day 4 is MISSING_IN
      expect(result[0].actualMinutes).toBeGreaterThan(0); // From days 3 and 5
      // Day 4 keeps its full scheduled duration in missing minutes.
      expect(result[0].missingMinutes).toBeGreaterThanOrEqual(360);
    }
  });

  it("handles waiver override - actual = required, missing = 0", () => {
    const punches = [
      punch("1", "2026-11-03 09:20:00", 0),
      punch("1", "2026-11-03 15:00:00", 1),
    ];

    const waivers = new Map<string, boolean>();
    waivers.set("1|2026-11-03", true);

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches,
      waivers,
    });

    if (result[0]) {
      expect(result[0].lateDays).toBe(0); // Waiver clears late
      expect(result[0].actualMinutes).toBeGreaterThan(0); // Waiver day has actual
      expect(result[0].missingMinutes).toBeGreaterThan(0); // ABSENT days still count
    }
  });

  it("excludes future dates from totals", () => {
    // Use a month in a future year to ensure all dates are in the future
    const futureYear = new Date().getFullYear() + 1;
    const futureMonth = `${futureYear}-01`;

    const punches = [
      punch("1", `${futureMonth}-15 09:20:00`, 0),
      punch("1", `${futureMonth}-15 15:00:00`, 1),
    ];

    const result = calculateMonthlyAttendance({
      month: futureMonth,
      employees: [employee],
      punches,
    });

    // All dates in a future year should be skipped, so no late days or required minutes
    if (result[0]) {
      expect(result[0].lateDays).toBe(0);
      expect(result[0].requiredMinutes).toBe(0);
    }
  });

  it("employee without shift returns valid zeros not null", () => {
    const employeeWithoutShift: AttendanceEmployee = {
      employeeId: 99,
      fullName: "No Shift Employee",
      shiftId: null,
      shiftName: null,
      timeIn: null,
      timeOut: null,
      allowanceMinutes: null,
    };

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employeeWithoutShift],
      punches: [],
    });

    expect(result).toHaveLength(1);
    if (result[0]) {
      expect(result[0].actualMinutes).toBe(0);
      expect(result[0].missingMinutes).toBe(0);
      expect(result[0].requiredMinutes).toBe(0);
      expect(result[0].workedHours).toBe(0);
      expect(result[0].missingHours).toBe(0);
      expect(Number.isFinite(result[0].actualMinutes)).toBe(true);
      expect(Number.isFinite(result[0].missingMinutes)).toBe(true);
      expect(Number.isFinite(result[0].workedHours)).toBe(true);
      expect(Number.isFinite(result[0].missingHours)).toBe(true);
    }
  });

  it("JSON serialization does not produce null for numeric fields", () => {
    const employeeWithoutShift: AttendanceEmployee = {
      employeeId: 99,
      fullName: "No Shift Employee",
      shiftId: null,
      shiftName: null,
      timeIn: null,
      timeOut: null,
      allowanceMinutes: null,
    };

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employeeWithoutShift, employee],
      punches: [],
    });

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    for (const row of parsed) {
      expect(row.actualMinutes).not.toBeNull();
      expect(row.missingMinutes).not.toBeNull();
      expect(row.workedHours).not.toBeNull();
      expect(row.missingHours).not.toBeNull();
      expect(typeof row.actualMinutes).toBe("number");
      expect(typeof row.missingMinutes).toBe("number");
      expect(typeof row.workedHours).toBe("number");
      expect(typeof row.missingHours).toBe("number");
    }
  });
});

describe("calculateMonthlyDailyRecords", () => {
  it("returns one dated row per calendar day, including weekends and future dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T10:00:00.000Z"));

    try {
      const rows = calculateMonthlyDailyRecords({
        month: MONTH,
        employee,
        punches: [],
      });

      // November has 30 calendar days, all present and in order.
      expect(rows).toHaveLength(30);
      expect(rows[0]?.date).toBe("2026-11-01");
      expect(rows[29]?.date).toBe("2026-11-30");

      // Friday and Saturday are weekends.
      expect(rows.find((row) => row.date === "2026-11-06")?.status).toBe("WEEKEND");
      expect(rows.find((row) => row.date === "2026-11-07")?.status).toBe("WEEKEND");

      // A closed working day without punches is ABSENT.
      expect(rows.find((row) => row.date === "2026-11-02")?.status).toBe("ABSENT");

      // A future date is still PENDING and must not be actionable.
      expect(rows.find((row) => row.date === "2026-11-18")?.status).toBe("PENDING");
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries the stored waiver into the day row and credits the day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T10:00:00.000Z"));

    try {
      const waivers = new Map<string, boolean>([["1|2026-11-03", true]]);

      const rows = calculateMonthlyDailyRecords({
        month: MONTH,
        employee,
        punches: [punch("1", "2026-11-03 09:30:00", 0)], // IN only -> MISSING_OUT
        waivers,
      });

      const waivedDay = rows.find((row) => row.date === "2026-11-03");

      expect(waivedDay?.status).toBe("PRESENT");
      expect(waivedDay?.waiver).toBe(true);
      expect(waivedDay?.requiredMinutes).toBe(360);
      expect(waivedDay?.actualMinutes).toBe(360);
      expect(waivedDay?.missingMinutes).toBe(0);
      // The punch itself is untouched.
      expect(waivedDay?.checkIn).toBe("09:30");
    } finally {
      vi.useRealTimers();
    }
  });
});
