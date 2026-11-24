import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDailyAttendanceSource,
  getDailyAttendanceWaivers,
  persistDailyAttendance,
  setAttendanceWaiver,
  type AttendanceEmployee,
} from "./attendance.repository";
import {
  getLeaveDetailsForDate,
  isEmployeeOnLeave,
} from "../leave/leave.repository";
import {
  getDailyAttendance,
  refreshAndPersistDailyAttendance,
  setDailyAttendanceWaiver,
} from "./attendance.service";

/**
 * Both repositories are mocked so the waiver guard and the leave-detail wiring
 * can be exercised without a database. `attendance.calculator` stays real.
 */
vi.mock("./attendance.repository", () => ({
  getDailyAttendanceSource: vi.fn(),
  getDailyAttendanceWaivers: vi.fn(),
  persistDailyAttendance: vi.fn(),
  setAttendanceWaiver: vi.fn(),
}));

vi.mock("../leave/leave.repository", () => ({
  getLeaveDetailsForRange: vi.fn(),
  getLeaveDetailsForDate: vi.fn(),
  isEmployeeOnLeave: vi.fn(),
}));

const mockSetAttendanceWaiver = vi.mocked(setAttendanceWaiver);
const mockIsEmployeeOnLeave = vi.mocked(isEmployeeOnLeave);
const mockGetDailyAttendanceSource = vi.mocked(getDailyAttendanceSource);
const mockGetDailyAttendanceWaivers = vi.mocked(getDailyAttendanceWaivers);
const mockGetLeaveDetailsForDate = vi.mocked(getLeaveDetailsForDate);
const mockPersistDailyAttendance = vi.mocked(persistDailyAttendance);

const USER_ID = BigInt(42);
const DATE = "2026-11-03";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEmployeeOnLeave.mockResolvedValue(false);
  mockSetAttendanceWaiver.mockResolvedValue(true);
  mockGetDailyAttendanceSource.mockResolvedValue({ employees: [], punches: [] });
  mockGetDailyAttendanceWaivers.mockResolvedValue([]);
  mockGetLeaveDetailsForDate.mockResolvedValue([]);
  mockPersistDailyAttendance.mockResolvedValue(undefined);
});

describe("setDailyAttendanceWaiver", () => {
  it("refuses to grant a waiver on a day covered by an approved leave", async () => {
    mockIsEmployeeOnLeave.mockResolvedValue(true);

    const result = await setDailyAttendanceWaiver({
      employeeId: 7,
      date: DATE,
      waiver: true,
      reason: "Forgot to punch",
      userId: USER_ID,
    });

    expect(result).toEqual({ ok: false, reason: "on_leave" });
    // Nothing is written when the day is already covered by leave.
    expect(mockSetAttendanceWaiver).not.toHaveBeenCalled();
  });

  it("does not check for leave when revoking a waiver", async () => {
    mockIsEmployeeOnLeave.mockResolvedValue(true);

    const result = await setDailyAttendanceWaiver({
      employeeId: 7,
      date: DATE,
      waiver: false,
      reason: "",
      userId: USER_ID,
    });

    expect(mockIsEmployeeOnLeave).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      state: { employeeId: 7, date: DATE, waiver: false },
    });
  });

  it("persists the session user id and reason when granting", async () => {
    const result = await setDailyAttendanceWaiver({
      employeeId: 7,
      date: DATE,
      waiver: true,
      reason: "Forgot to punch",
      userId: USER_ID,
    });

    expect(mockSetAttendanceWaiver).toHaveBeenCalledWith(7, DATE, true, {
      reason: "Forgot to punch",
      userId: USER_ID,
    });
    expect(result).toEqual({
      ok: true,
      state: { employeeId: 7, date: DATE, waiver: true },
    });
  });

  it("reports not_found when the employee has no attendance row", async () => {
    mockSetAttendanceWaiver.mockResolvedValue(false);

    const result = await setDailyAttendanceWaiver({
      employeeId: 7,
      date: DATE,
      waiver: true,
      reason: "Forgot to punch",
      userId: USER_ID,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("getDailyAttendance leave details", () => {
  // 2020-01-07 is a Tuesday and 2020-01-10 a Friday, so both are unambiguously
  // in the past regardless of when the suite runs.
  const WORKING_DAY = "2020-01-07";
  const FRIDAY = "2020-01-10";

  const employee: AttendanceEmployee = {
    employeeId: 1,
    fullName: "Test Employee",
    shiftId: 1,
    shiftName: "Morning Shift",
    timeIn: "09:00:00",
    timeOut: "15:00:00",
    allowanceMinutes: 15,
    hireDate: "2019-01-01",
  };

  const leaveDetail = {
    employeeId: 1,
    dateFrom: "2020-01-06",
    dateTo: "2020-01-08",
    leaveId: "9",
    leaveType: "VACATION" as const,
    reason: "Annual leave",
    createdByName: "manager",
    createdAt: "2020-01-01T00:00:00.000Z",
  };

  it("attaches the covering leave to a LEAVE day with zero minutes", async () => {
    mockGetDailyAttendanceSource.mockResolvedValue({
      employees: [employee],
      punches: [],
    });
    mockGetLeaveDetailsForDate.mockResolvedValue([leaveDetail]);

    const result = await getDailyAttendance(WORKING_DAY);

    expect(result.employees[0]).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
      leave: {
        leaveId: "9",
        leaveType: "VACATION",
        createdByName: "manager",
        reason: "Annual leave",
      },
    });
  });

  it("leaves the details null for a day without leave", async () => {
    mockGetDailyAttendanceSource.mockResolvedValue({
      employees: [employee],
      punches: [],
    });
    mockGetLeaveDetailsForDate.mockResolvedValue([]);

    const result = await getDailyAttendance(WORKING_DAY);

    expect(result.employees[0]?.status).toBe("ABSENT");
    expect(result.employees[0]?.leave).toBeNull();
  });

  it("does not attach leave details to a weekend that merely falls in the span", async () => {
    mockGetDailyAttendanceSource.mockResolvedValue({
      employees: [employee],
      punches: [],
    });
    mockGetLeaveDetailsForDate.mockResolvedValue([
      { ...leaveDetail, dateFrom: "2020-01-01", dateTo: "2020-01-31" },
    ]);

    const result = await getDailyAttendance(FRIDAY);

    expect(result.employees[0]?.status).toBe("WEEKEND");
    expect(result.employees[0]?.leave).toBeNull();
  });
});

describe("refreshAndPersistDailyAttendance", () => {
  it("persists the calculated rows for the requested date", async () => {
    const employee: AttendanceEmployee = {
      employeeId: 1,
      fullName: "Test Employee",
      shiftId: 1,
      shiftName: "Morning Shift",
      timeIn: "09:00:00",
      timeOut: "15:00:00",
      allowanceMinutes: 15,
      hireDate: "2019-01-01",
    };
    mockGetDailyAttendanceSource.mockResolvedValue({
      employees: [employee],
      punches: [],
    });

    await refreshAndPersistDailyAttendance(DATE);

    expect(mockPersistDailyAttendance).toHaveBeenCalledTimes(1);
    const [persistedDate, rows] = mockPersistDailyAttendance.mock.calls[0]!;
    expect(persistedDate).toBe(DATE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ employeeId: 1, status: "ABSENT" });
  });

  it("propagates persistence failures to the caller", async () => {
    mockPersistDailyAttendance.mockRejectedValue(new Error("db down"));

    await expect(
      refreshAndPersistDailyAttendance(DATE),
    ).rejects.toThrow("db down");
  });
});

describe("getDailyAttendance hire date eligibility", () => {
  const HIRED_AFTER_DATE = "2026-09-02";
  const HIRE_DATE = "2026-09-03";
  const HIRE_DATE_AFTER = "2026-09-07"; // Monday (working day)

  const employeeWithHireDate: AttendanceEmployee = {
    employeeId: 9,
    fullName: "Suleiman Al-Zalawi",
    shiftId: 1,
    shiftName: "Morning Shift",
    timeIn: "09:00:00",
    timeOut: "15:00:00",
    allowanceMinutes: 15,
    hireDate: HIRE_DATE,
  };

  const employeeWithoutHireDate: AttendanceEmployee = {
    employeeId: 10,
    fullName: "No Hire Date",
    shiftId: 1,
    shiftName: "Morning Shift",
    timeIn: "09:00:00",
    timeOut: "15:00:00",
    allowanceMinutes: 15,
    hireDate: null,
  };

  it("excludes an employee from the daily report on a date before their hire date", async () => {
    mockGetDailyAttendanceSource.mockResolvedValue({
      employees: [employeeWithHireDate],
      punches: [],
    });

    const result = await getDailyAttendance(HIRED_AFTER_DATE);

    expect(result.employees).toHaveLength(0);
  });

  it("includes an employee on their hire date", async () => {
    mockGetDailyAttendanceSource.mockResolvedValue({
      employees: [employeeWithHireDate],
      punches: [],
    });

    const result = await getDailyAttendance(HIRE_DATE);

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]?.employeeId).toBe(9);
    expect(result.employees[0]?.status).toBe("ABSENT");
  });

  it("includes an employee on dates after their hire date", async () => {
    mockGetDailyAttendanceSource.mockResolvedValue({
      employees: [employeeWithHireDate],
      punches: [],
    });

    const result = await getDailyAttendance(HIRE_DATE_AFTER);

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]?.employeeId).toBe(9);
    expect(result.employees[0]?.status).toBe("ABSENT");
  });

  it("preserves existing behavior for employees with null hire date", async () => {
    mockGetDailyAttendanceSource.mockResolvedValue({
      employees: [employeeWithoutHireDate],
      punches: [],
    });

    const result = await getDailyAttendance(HIRED_AFTER_DATE);

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]?.employeeId).toBe(10);
    expect(result.employees[0]?.status).toBe("ABSENT");
  });
});
