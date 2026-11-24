import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateDailyAttendance } from "./attendance.calculator";
import {
  calculateMonthlyAttendance,
  calculateMonthlyDailyRecords,
} from "./monthly-attendance.calculator";
import type {
  AttendanceEmployee,
  AttendanceLeave,
  AttendancePunch,
} from "./attendance.repository";

const MONTH = "2026-11";

/** 2026-11-05 is a Thursday (weekends are Friday and Saturday). */
const THURSDAY = "2026-11-05";

/** Pin "now" just after the shift so the day is closed and deterministic. */
const NOW = `${THURSDAY}T16:00:00.000Z`;

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

function leave(
  dateFrom: string,
  dateTo: string,
  leaveType: AttendanceLeave["leaveType"] = "VACATION",
  employeeId = 1,
): AttendanceLeave {
  return { employeeId, dateFrom, dateTo, leaveType };
}

/** A full, on-time working day: 09:00 IN, 15:00 OUT. */
const fullDayPunches = [
  punch("1", `${THURSDAY} 09:00:00`, 0),
  punch("1", `${THURSDAY} 15:00:00`, 1),
];

function calculateDaily(overrides: {
  leaves?: AttendanceLeave[];
  waivers?: Map<string, boolean>;
  punches?: AttendancePunch[];
}) {
  return calculateDailyAttendance({
    date: THURSDAY,
    employees: [employee],
    punches: overrides.punches ?? fullDayPunches,
    now: NOW,
    leaves: overrides.leaves,
    waivers: overrides.waivers,
  })[0];
}

describe("daily attendance with leave", () => {
  it.each(["VACATION", "SICK_LEAVE"] as const)(
    "removes an approved %s day from required, actual and missing minutes",
    (leaveType) => {
      const row = calculateDaily({
        leaves: [leave(THURSDAY, THURSDAY, leaveType)],
        punches: [], // No punches - leave should produce LEAVE
      });

      expect(row, leaveType).toMatchObject({
        status: "LEAVE",
        requiredMinutes: 0,
        actualMinutes: 0,
        missingMinutes: 0,
        lateMinutes: 0,
        punchCount: 0,
      });
    },
  );

  it("keeps an UNPAID day's scheduled minutes as required and counts them as missing", () => {
    const row = calculateDaily({
      leaves: [leave(THURSDAY, THURSDAY, "UNPAID")],
      punches: [], // No punches - leave should produce LEAVE
    });

    expect(row).toMatchObject({
      // The status stays LEAVE, never ABSENT.
      status: "LEAVE",
      // The shift's scheduled duration stays in Required Minutes.
      requiredMinutes: 360,
      actualMinutes: 0,
      // The whole scheduled duration is discounted.
      missingMinutes: 360,
      lateMinutes: 0,
      punchCount: 0,
    });
  });

  it("never treats Friday or Saturday as a leave working day", () => {
    // 2026-11-06 = Friday, 2026-11-07 = Saturday.
    const friday = calculateDailyAttendance({
      date: "2026-11-06",
      employees: [employee],
      punches: [],
      now: "2026-11-06T16:00:00.000Z",
      leaves: [leave("2026-11-01", "2026-11-30")],
    })[0];
    const saturday = calculateDailyAttendance({
      date: "2026-11-07",
      employees: [employee],
      punches: [],
      now: "2026-11-07T16:00:00.000Z",
      leaves: [leave("2026-11-01", "2026-11-30")],
    })[0];

    expect(friday?.status).toBe("WEEKEND");
    expect(saturday?.status).toBe("WEEKEND");
  });

  it("ignores a leave period that starts after the reporting date", () => {
    const row = calculateDaily({ leaves: [leave("2026-11-10", "2026-11-12")] });

    expect(row?.status).toBe("PRESENT");
    expect(row?.requiredMinutes).toBe(360);
  });

  it("lets leave take precedence over a stored waiver when there are no punches", () => {
    const row = calculateDaily({
      leaves: [leave(THURSDAY, THURSDAY)],
      waivers: new Map<string, boolean>([[`1|${THURSDAY}`, true]]),
      punches: [], // No punches - leave should take precedence
    });

    expect(row).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
    });
  });

  it("keeps the existing attendance result when no leave exists", () => {
    const row = calculateDaily({});

    expect(row).toMatchObject({
      status: "PRESENT",
      requiredMinutes: 360,
      actualMinutes: 360,
      missingMinutes: 0,
      lateMinutes: 0,
    });
  });

  it("credits a waived day with the full scheduled minutes as before", () => {
    const row = calculateDaily({
      punches: [
        punch("1", `${THURSDAY} 09:30:00`, 0), // late IN
        punch("1", `${THURSDAY} 15:00:00`, 1),
      ],
      waivers: new Map<string, boolean>([[`1|${THURSDAY}`, true]]),
    });

    expect(row).toMatchObject({
      status: "PRESENT",
      requiredMinutes: 360,
      actualMinutes: 360,
      missingMinutes: 0,
      lateMinutes: 0,
      waiver: true,
    });
  });

  it("produces LEAVE when approved leave exists with no punches", () => {
    const row = calculateDaily({
      leaves: [leave(THURSDAY, THURSDAY)],
      punches: [],
    });

    expect(row).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
      lateMinutes: 0,
      punchCount: 0,
    });
  });

  it("lets approved leave take precedence over IN and OUT punches", () => {
    const row = calculateDaily({
      leaves: [leave(THURSDAY, THURSDAY)],
      punches: fullDayPunches,
    });

    expect(row).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
      lateMinutes: 0,
      workedMinutes: 0,
      checkIn: null,
      checkOut: null,
      effectiveStart: null,
    });
  });

  it("lets approved leave take precedence over late IN and OUT punches", () => {
    const row = calculateDaily({
      leaves: [leave(THURSDAY, THURSDAY)],
      punches: [
        punch("1", `${THURSDAY} 09:20:00`, 0), // late IN
        punch("1", `${THURSDAY} 15:00:00`, 1),
      ],
    });

    expect(row).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
      lateMinutes: 0,
      workedMinutes: 0,
      checkIn: null,
      checkOut: null,
    });
  });

  it("lets approved leave take precedence over an IN-only punch", () => {
    const row = calculateDaily({
      leaves: [leave(THURSDAY, THURSDAY)],
      punches: [punch("1", `${THURSDAY} 09:10:00`, 0)], // IN only
    });

    expect(row).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
      lateMinutes: 0,
      workedMinutes: 0,
      checkIn: null,
      checkOut: null,
    });
  });

  it("lets approved leave take precedence over an OUT-only punch", () => {
    const row = calculateDaily({
      leaves: [leave(THURSDAY, THURSDAY)],
      punches: [punch("1", `${THURSDAY} 16:10:00`, 1)], // OUT only
    });

    expect(row).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
      lateMinutes: 0,
      workedMinutes: 0,
      checkIn: null,
      checkOut: null,
    });
  });

  it("keeps UNPAID leave semantics when punches exist", () => {
    const row = calculateDaily({
      leaves: [leave(THURSDAY, THURSDAY, "UNPAID")],
      punches: fullDayPunches,
    });

    expect(row).toMatchObject({
      status: "LEAVE",
      // UNPAID keeps the scheduled minutes as a discount.
      requiredMinutes: 360,
      actualMinutes: 0,
      missingMinutes: 360,
      lateMinutes: 0,
      workedMinutes: 0,
      checkIn: null,
      checkOut: null,
    });
  });

  it("lets punches determine the result when the leave is cancelled", () => {
    // A cancelled leave never reaches the calculator: the repository only
    // returns ACTIVE periods, so the input here is simply "no leave".
    const row = calculateDaily({ punches: fullDayPunches });

    expect(row).toMatchObject({
      status: "PRESENT",
      requiredMinutes: 360,
      actualMinutes: 360,
      missingMinutes: 0,
      lateMinutes: 0,
      workedMinutes: 360,
      checkIn: "09:00",
      checkOut: "15:00",
    });
  });
});

describe("monthly attendance with leave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * November 2026 working days up to the 15th: 01-05, 08-12, 15 -> 11 days.
   * Each is a 360-minute shift, so the baseline Required Minutes is 3960.
   */
  function pinNow() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T10:00:00.000Z"));
  }

  it("keeps the baseline totals when no leave exists", () => {
    pinNow();

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches: [],
    });

    // With new PENDING threshold (shift start + allowance), day 15 is now ABSENT at 16:00.
    // So all 11 working days (2nd-15th excluding weekends) are ABSENT.
    expect(result[0]).toMatchObject({
      requiredMinutes: 11 * 360,
      actualMinutes: 0,
      missingMinutes: 11 * 360,
      lateDays: 0,
      reviewDays: 0,
    });
  });

  it("excludes every working day of a multi-day leave from Required Minutes", () => {
    pinNow();

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches: [],
      // Monday 2nd to Wednesday 4th: three scheduled working days.
      leaves: [leave("2026-11-02", "2026-11-04")],
    });

    expect(result[0]).toMatchObject({
      requiredMinutes: 11 * 360 - 3 * 360,
      // The three leave days are neither absent nor review days.
      missingMinutes: 11 * 360 - 3 * 360,
      actualMinutes: 0,
      lateDays: 0,
      reviewDays: 0,
    });
  });

  it("keeps an UNPAID leave day in Required Minutes and discounts the full shift", () => {
    pinNow();

    const leaves = [leave("2026-11-02", "2026-11-04", "UNPAID")];

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches: [],
      leaves,
    });

    expect(result[0]).toMatchObject({
      // The three unpaid days stay in Required Minutes.
      requiredMinutes: 11 * 360,
      actualMinutes: 0,
      // Eight unwaived ABSENT days (excluding three unpaid days which are also absent but counted in required)
      missingMinutes: 11 * 360,
      lateDays: 0,
      reviewDays: 0,
    });

    const rows = calculateMonthlyDailyRecords({
      month: MONTH,
      employee,
      punches: [],
      leaves,
    });
    const unpaidDay = rows.find((row) => row.date === "2026-11-02");

    expect(unpaidDay).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 360,
      actualMinutes: 0,
      missingMinutes: 360,
    });
  });

  it("excludes only the working days of a leave that spans weekends", () => {
    pinNow();

    // Thursday 5th -> Monday 9th. Friday 6th and Saturday 7th are weekends and
    // must not be counted as leave working days.
    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches: [],
      leaves: [leave("2026-11-05", "2026-11-09")],
    });

    expect(result[0]).toMatchObject({
      // Only 5th, 8th and 9th are scheduled working days inside the period.
      requiredMinutes: 11 * 360 - 3 * 360,
      missingMinutes: 11 * 360 - 3 * 360,
      reviewDays: 0,
    });
  });

  it("reports leave days as LEAVE with zero minutes instead of ABSENT", () => {
    pinNow();

    const rows = calculateMonthlyDailyRecords({
      month: MONTH,
      employee,
      punches: [],
      leaves: [leave("2026-11-03", "2026-11-04")],
    });

    const leaveDay = rows.find((row) => row.date === "2026-11-03");
    const untouchedDay = rows.find((row) => row.date === "2026-11-02");

    expect(leaveDay).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
    });
    // A day outside the period keeps the normal ABSENT result.
    expect(untouchedDay?.status).toBe("ABSENT");
    expect(untouchedDay?.requiredMinutes).toBe(360);
  });

  it("still credits a waived day with the full scheduled minutes", () => {
    pinNow();

    const waivers = new Map<string, boolean>([["1|2026-11-03", true]]);

    const result = calculateMonthlyAttendance({
      month: MONTH,
      employees: [employee],
      punches: [],
      waivers,
    });

    expect(result[0]).toMatchObject({
      // A waiver never reduces Required Minutes.
      requiredMinutes: 11 * 360,
      // The waived ABSENT day counts its full shift as actual.
      actualMinutes: 360,
      missingMinutes: 11 * 360 - 360,
      lateDays: 0,
      reviewDays: 0,
    });
  });
});
