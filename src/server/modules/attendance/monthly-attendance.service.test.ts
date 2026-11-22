import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMonthlyAttendanceSource } from "./monthly-attendance.repository";
import { getAttendanceWaivers } from "./attendance.repository";
import { getLeaveDetailsForRange } from "../leave/leave.repository";
import type { AttendanceEmployee } from "./attendance.repository";
import { getMonthlyAttendance } from "./monthly-attendance.service";

/**
 * The repositories are mocked so the monthly service wiring can be exercised
 * without a database. `monthly-attendance.calculator` stays real: the point of
 * these tests is that ACTIVE leave details reach both the calculator (as minimal
 * periods) and the per-day rows (as display details).
 */
vi.mock("./monthly-attendance.repository", () => ({
  getMonthlyAttendanceSource: vi.fn(),
}));

vi.mock("./attendance.repository", () => ({
  getAttendanceWaivers: vi.fn(),
}));

vi.mock("../leave/leave.repository", () => ({
  getLeaveDetailsForRange: vi.fn(),
}));

const mockSource = vi.mocked(getMonthlyAttendanceSource);
const mockWaivers = vi.mocked(getAttendanceWaivers);
const mockLeaves = vi.mocked(getLeaveDetailsForRange);

const MONTH = "2020-01"; // 2020-01-03 is a Friday, 2020-01-04 a Saturday.

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
  dateFrom: "2020-01-01",
  dateTo: "2020-01-07",
  leaveId: "9",
  leaveType: "SICK_LEAVE" as const,
  reason: "Flu",
  createdByName: "manager",
  createdAt: "2020-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSource.mockResolvedValue({ employees: [employee], punches: [] });
  mockWaivers.mockResolvedValue([]);
  mockLeaves.mockResolvedValue([]);
});

describe("getMonthlyAttendance leave details", () => {
  it("attaches the covering leave, with its type, to LEAVE day rows", async () => {
    mockLeaves.mockResolvedValue([leaveDetail]);

    const result = await getMonthlyAttendance(MONTH, 1);
    const day = result.days?.find((row) => row.date === "2020-01-01");

    expect(day).toMatchObject({
      status: "LEAVE",
      requiredMinutes: 0,
      actualMinutes: 0,
      missingMinutes: 0,
      leave: {
        leaveId: "9",
        leaveType: "SICK_LEAVE",
        reason: "Flu",
        createdByName: "manager",
      },
    });
  });

  it("does not attach leave to a weekend inside the leave span", async () => {
    mockLeaves.mockResolvedValue([leaveDetail]);

    const result = await getMonthlyAttendance(MONTH, 1);
    const friday = result.days?.find((row) => row.date === "2020-01-03");

    expect(friday?.status).toBe("WEEKEND");
    expect(friday?.leave).toBeNull();
  });

  it("leaves the detail null on days outside the leave span", async () => {
    mockLeaves.mockResolvedValue([leaveDetail]);

    const result = await getMonthlyAttendance(MONTH, 1);
    const day = result.days?.find((row) => row.date === "2020-01-08");

    expect(day?.status).not.toBe("LEAVE");
    expect(day?.leave).toBeNull();
  });

  it("returns no per-day rows for the aggregate report", async () => {
    const result = await getMonthlyAttendance(MONTH);

    expect(result.days).toBeUndefined();
    expect(result.employees).toHaveLength(1);
  });

  it("still excludes leave days from the monthly required minutes", async () => {
    // January 2020 has 22 working days (Fri/Sat are the weekend), each 360
    // minutes. The leave covers 2020-01-01..2020-01-07, i.e. 5 working days.
    mockLeaves.mockResolvedValue([leaveDetail]);
    const withLeave = await getMonthlyAttendance(MONTH);

    mockLeaves.mockResolvedValue([]);
    const withoutLeave = await getMonthlyAttendance(MONTH);

    expect(withoutLeave.employees[0]?.requiredMinutes).toBe(22 * 360);
    expect(withLeave.employees[0]?.requiredMinutes).toBe(17 * 360);
  });
});
