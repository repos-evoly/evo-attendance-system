import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelEmployeeLeave,
  createEmployeeLeave,
  employeeExists,
  getEmployeeLeave,
  listLeavePeriods,
} from "./leave.repository";
import { cancelLeave, createLeave } from "./leave.service";
import { refreshAndPersistDailyAttendance } from "../attendance/attendance.service";
import type { EmployeeLeaveRecord } from "./leave.types";

/**
 * The service is the only place the leave business rules live, so the
 * repository is mocked: no database connection is required and the assertions
 * stay focused on validation, overlap rejection, cancellation guards and
 * `createdById` / `cancelledById` propagation.
 */
vi.mock("./leave.repository", () => ({
  employeeExists: vi.fn(),
  listLeavePeriods: vi.fn(),
  createEmployeeLeave: vi.fn(),
  listEmployeeLeaves: vi.fn(),
  getEmployeeLeave: vi.fn(),
  cancelEmployeeLeave: vi.fn(),
  getLeaveDetailsForRange: vi.fn(),
  getLeaveDetailsForDate: vi.fn(),
  isEmployeeOnLeave: vi.fn(),
}));

// The attendance refresh is mocked so no database is touched; the leave
// service's own rules stay under test.
vi.mock("../attendance/attendance.service", () => ({
  refreshAndPersistDailyAttendance: vi.fn(),
}));

const mockRefreshAndPersist = vi.mocked(refreshAndPersistDailyAttendance);

const mockEmployeeExists = vi.mocked(employeeExists);
const mockListLeavePeriods = vi.mocked(listLeavePeriods);
const mockCreateEmployeeLeave = vi.mocked(createEmployeeLeave);
const mockGetEmployeeLeave = vi.mocked(getEmployeeLeave);
const mockCancelEmployeeLeave = vi.mocked(cancelEmployeeLeave);

const CREATED_BY = BigInt(42);
const CANCELLED_BY = BigInt(7);

const storedRecord: EmployeeLeaveRecord = {
  leaveId: "1",
  employeeId: 7,
  employeeName: "Ada Lovelace",
  dateFrom: "2026-11-02",
  dateTo: "2026-11-04",
  leaveType: "VACATION",
  status: "ACTIVE",
  reason: null,
  createdById: CREATED_BY.toString(),
  createdByName: "manager",
  createdAt: "2026-11-01T00:00:00.000Z",
  cancelledAt: null,
  cancelledById: null,
  cancelledByName: null,
  cancellationReason: null,
};

const cancelledRecord: EmployeeLeaveRecord = {
  ...storedRecord,
  status: "CANCELLED",
  cancelledAt: "2026-11-05T08:30:00.000Z",
  cancelledById: CANCELLED_BY.toString(),
  cancelledByName: "manager",
  cancellationReason: "Trip postponed",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEmployeeExists.mockResolvedValue(true);
  mockListLeavePeriods.mockResolvedValue([]);
  mockCreateEmployeeLeave.mockResolvedValue(storedRecord);
  mockGetEmployeeLeave.mockResolvedValue(storedRecord);
  mockCancelEmployeeLeave.mockResolvedValue(cancelledRecord);
  mockRefreshAndPersist.mockResolvedValue(undefined);
});

describe("createLeave validation", () => {
  it("rejects a period whose end is before its start", async () => {
    const result = await createLeave({
      employeeId: 7,
      dateFrom: "2026-11-04",
      dateTo: "2026-11-02",
      leaveType: "VACATION",
      reason: null,
      createdById: CREATED_BY,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_RANGE", message: expect.any(String) },
    });
    // The invalid range is rejected before any lookup or write.
    expect(mockEmployeeExists).not.toHaveBeenCalled();
    expect(mockCreateEmployeeLeave).not.toHaveBeenCalled();
  });

  it("accepts a single-day period", async () => {
    const result = await createLeave({
      employeeId: 7,
      dateFrom: "2026-11-02",
      dateTo: "2026-11-02",
      leaveType: "SICK_LEAVE",
      reason: null,
      createdById: CREATED_BY,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a leave for an employee that does not exist", async () => {
    mockEmployeeExists.mockResolvedValue(false);

    const result = await createLeave({
      employeeId: 999,
      dateFrom: "2026-11-02",
      dateTo: "2026-11-04",
      leaveType: "VACATION",
      reason: null,
      createdById: CREATED_BY,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "EMPLOYEE_NOT_FOUND", message: expect.any(String) },
    });
    expect(mockCreateEmployeeLeave).not.toHaveBeenCalled();
  });
});

describe("createLeave overlap prevention", () => {
  it("rejects a period that fully overlaps an existing leave", async () => {
    mockListLeavePeriods.mockResolvedValue([
      {
        employeeId: 7,
        dateFrom: "2026-11-02",
        dateTo: "2026-11-04",
        leaveType: "VACATION" as const,
      },
    ]);

    const result = await createLeave({
      employeeId: 7,
      dateFrom: "2026-11-03",
      dateTo: "2026-11-04",
      leaveType: "UNPAID",
      reason: null,
      createdById: CREATED_BY,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("OVERLAP");
    expect(mockCreateEmployeeLeave).not.toHaveBeenCalled();
  });

  it("rejects a period that only touches an existing leave on one day", async () => {
    mockListLeavePeriods.mockResolvedValue([
      {
        employeeId: 7,
        dateFrom: "2026-11-02",
        dateTo: "2026-11-04",
        leaveType: "VACATION" as const,
      },
    ]);

    // Starts on the existing leave's last day, so 2026-11-04 is double-booked.
    const result = await createLeave({
      employeeId: 7,
      dateFrom: "2026-11-04",
      dateTo: "2026-11-06",
      leaveType: "VACATION",
      reason: null,
      createdById: CREATED_BY,
    });

    expect(result.ok === false && result.error.code).toBe("OVERLAP");
    expect(mockCreateEmployeeLeave).not.toHaveBeenCalled();
  });

  it("allows a period that starts the day after an existing leave ends", async () => {
    mockListLeavePeriods.mockResolvedValue([
      {
        employeeId: 7,
        dateFrom: "2026-11-02",
        dateTo: "2026-11-04",
        leaveType: "VACATION" as const,
      },
    ]);

    const result = await createLeave({
      employeeId: 7,
      dateFrom: "2026-11-05",
      dateTo: "2026-11-06",
      leaveType: "VACATION",
      reason: null,
      createdById: CREATED_BY,
    });

    expect(result.ok).toBe(true);
    expect(mockCreateEmployeeLeave).toHaveBeenCalledTimes(1);
  });
});

describe("createLeave persistence", () => {
  it("stores the authenticated user id as createdById", async () => {
    await createLeave({
      employeeId: 7,
      dateFrom: "2026-11-02",
      dateTo: "2026-11-04",
      leaveType: "VACATION",
      reason: "Annual leave",
      createdById: CREATED_BY,
    });

    expect(mockCreateEmployeeLeave).toHaveBeenCalledWith({
      employeeId: 7,
      dateFrom: "2026-11-02",
      dateTo: "2026-11-04",
      leaveType: "VACATION",
      reason: "Annual leave",
      createdById: CREATED_BY,
    });
  });

  it("accepts dates an earlier cancelled leave used to occupy", async () => {
    // The repository only reports ACTIVE periods, so a cancelled period no
    // longer blocks re-booking the same dates.
    mockListLeavePeriods.mockResolvedValue([]);

    const result = await createLeave({
      employeeId: 7,
      dateFrom: "2026-11-02",
      dateTo: "2026-11-04",
      leaveType: "VACATION",
      reason: null,
      createdById: CREATED_BY,
    });

    expect(result.ok).toBe(true);
    expect(mockCreateEmployeeLeave).toHaveBeenCalledTimes(1);
  });
});

describe("cancelLeave", () => {
  const LEAVED_ID = BigInt(1);

  it("rejects a leave that does not exist", async () => {
    mockGetEmployeeLeave.mockResolvedValue(null);

    const result = await cancelLeave(LEAVED_ID, {
      reason: "Trip postponed",
      cancelledById: CANCELLED_BY,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
    expect(mockCancelEmployeeLeave).not.toHaveBeenCalled();
  });

  it("rejects cancelling an already cancelled leave", async () => {
    mockGetEmployeeLeave.mockResolvedValue(cancelledRecord);

    const result = await cancelLeave(LEAVED_ID, {
      reason: "Second attempt",
      cancelledById: CANCELLED_BY,
    });

    expect(result.ok === false && result.error.code).toBe("ALREADY_CANCELLED");
    // The first cancellation's audit data is never overwritten.
    expect(mockCancelEmployeeLeave).not.toHaveBeenCalled();
  });

  it("records the acting user and reason while preserving the record", async () => {
    const result = await cancelLeave(LEAVED_ID, {
      reason: "Trip postponed",
      cancelledById: CANCELLED_BY,
    });

    expect(mockCancelEmployeeLeave).toHaveBeenCalledWith(LEAVED_ID, {
      reason: "Trip postponed",
      cancelledById: CANCELLED_BY,
    });
    // storedRecord spans Mon 2026-11-02 to Wed 2026-11-04: three refreshes.
    expect(result).toEqual({
      ok: true,
      leave: cancelledRecord,
      attendanceRefresh: { attemptedDates: 3, failedDates: [] },
    });
    // Original details survive; only the cancellation audit is added.
    expect(cancelledRecord.dateFrom).toBe(storedRecord.dateFrom);
    expect(cancelledRecord.leaveType).toBe(storedRecord.leaveType);
    expect(cancelledRecord.createdById).toBe(storedRecord.createdById);
  });

  it("reports already cancelled when the guarded update misses a concurrent cancel", async () => {
    mockCancelEmployeeLeave.mockResolvedValue(null);

    const result = await cancelLeave(LEAVED_ID, {
      reason: "Race",
      cancelledById: CANCELLED_BY,
    });

    expect(result.ok === false && result.error.code).toBe("ALREADY_CANCELLED");
  });
});

describe("attendance refresh after leave changes", () => {
  const INPUT = {
    employeeId: 7,
    dateFrom: "2026-11-02",
    dateTo: "2026-11-04",
    leaveType: "VACATION" as const,
    reason: null,
    createdById: CREATED_BY,
  };

  function leaveOn(dateFrom: string, dateTo: string): EmployeeLeaveRecord {
    return { ...storedRecord, dateFrom, dateTo };
  }

  it("refreshes every non-weekend date of a created leave", async () => {
    const result = await createLeave(INPUT);

    expect(result.ok).toBe(true);
    // 2026-11-02 (Mon), 11-03 (Tue), 11-04 (Wed) — all in the past.
    expect(mockRefreshAndPersist.mock.calls.map((call) => call[0])).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    expect(
      result.ok === true && result.attendanceRefresh,
    ).toEqual({ attemptedDates: 3, failedDates: [] });
  });

  it("refreshes the affected dates after a cancellation too", async () => {
    await cancelLeave(BigInt(1), {
      reason: "Trip postponed",
      cancelledById: CANCELLED_BY,
    });

    expect(mockRefreshAndPersist).toHaveBeenCalledTimes(3);
  });

  it("skips Friday and Saturday entirely", async () => {
    // Libya weekend is Fri+Sat: 2026-11-06 (Fri) and 11-07 (Sat) are skipped,
    // while Sunday 11-08 is a working day and 11-09 a Monday.
    mockCreateEmployeeLeave.mockResolvedValue(
      leaveOn("2026-11-06", "2026-11-09"),
    );

    const result = await createLeave({
      ...INPUT,
      dateFrom: "2026-11-06",
      dateTo: "2026-11-09",
    });

    expect(mockRefreshAndPersist.mock.calls.map((call) => call[0])).toEqual([
      "2026-11-08",
      "2026-11-09",
    ]);
    expect(
      result.ok === true && result.attendanceRefresh.attemptedDates,
    ).toBe(2);
  });

  it("does not process future dates", async () => {
    // Far-future range: nothing may be refreshed regardless of run date.
    mockCreateEmployeeLeave.mockResolvedValue(
      leaveOn("2099-01-05", "2099-01-09"),
    );

    const result = await createLeave({
      ...INPUT,
      dateFrom: "2099-01-05",
      dateTo: "2099-01-09",
    });

    expect(mockRefreshAndPersist).not.toHaveBeenCalled();
    expect(
      result.ok === true && result.attendanceRefresh,
    ).toEqual({ attemptedDates: 0, failedDates: [] });
  });

  it("collects per-date failures without aborting the remaining refreshes", async () => {
    mockRefreshAndPersist
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(undefined);

    const result = await createLeave(INPUT);

    // The leave still succeeded; only the refresh outcome reports the failure.
    expect(result.ok).toBe(true);
    expect(mockRefreshAndPersist).toHaveBeenCalledTimes(3);
    expect(
      result.ok === true && result.attendanceRefresh,
    ).toEqual({ attemptedDates: 3, failedDates: ["2026-11-02"] });
  });
});
