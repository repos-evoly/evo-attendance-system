import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPublicHoliday,
  createPublicHoliday,
  getPublicHoliday,
  listActivePublicHolidays,
  reactivatePublicHoliday,
  updatePublicHoliday,
} from "./public-holiday.repository";
import {
  cancelHoliday,
  createHoliday,
  reactivateHoliday,
  updateHoliday,
} from "./public-holiday.service";
import { refreshAndPersistDailyAttendance } from "../attendance/attendance.service";
import type { PublicHolidayRecord } from "./public-holiday.types";

/**
 * The repository is mocked so no database is required; the attendance
 * refresh is mocked for the same reason. The service's own validation and
 * refresh orchestration stay under test.
 */
vi.mock("./public-holiday.repository", () => ({
  listPublicHolidays: vi.fn(),
  listActivePublicHolidays: vi.fn(),
  getPublicHoliday: vi.fn(),
  createPublicHoliday: vi.fn(),
  updatePublicHoliday: vi.fn(),
  cancelPublicHoliday: vi.fn(),
  reactivatePublicHoliday: vi.fn(),
}));

vi.mock("../attendance/attendance.service", () => ({
  refreshAndPersistDailyAttendance: vi.fn(),
}));

const mockCreatePublicHoliday = vi.mocked(createPublicHoliday);
const mockGetPublicHoliday = vi.mocked(getPublicHoliday);
const mockUpdatePublicHoliday = vi.mocked(updatePublicHoliday);
const mockCancelPublicHoliday = vi.mocked(cancelPublicHoliday);
const mockReactivatePublicHoliday = vi.mocked(reactivatePublicHoliday);
const mockListActivePublicHolidays = vi.mocked(listActivePublicHolidays);
const mockRefreshAndPersist = vi.mocked(refreshAndPersistDailyAttendance);

const CREATED_BY = BigInt(42);
const CANCELLED_BY = BigInt(7);

const storedRecord: PublicHolidayRecord = {
  holidayId: "1",
  name: "National Day",
  dateFrom: "2026-11-02",
  dateTo: "2026-11-04",
  reason: null,
  createdById: CREATED_BY.toString(),
  createdByName: "admin",
  createdAt: "2026-11-01T00:00:00.000Z",
  cancelledAt: null,
  cancelledById: null,
  cancelledByName: null,
  cancellationReason: null,
};

const cancelledRecord: PublicHolidayRecord = {
  ...storedRecord,
  cancelledAt: "2026-11-05T08:30:00.000Z",
  cancelledById: CANCELLED_BY.toString(),
  cancelledByName: "admin",
  cancellationReason: "Postponed",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListActivePublicHolidays.mockResolvedValue([]);
  mockCreatePublicHoliday.mockResolvedValue(storedRecord);
  mockGetPublicHoliday.mockResolvedValue(storedRecord);
  mockUpdatePublicHoliday.mockResolvedValue(storedRecord);
  mockCancelPublicHoliday.mockResolvedValue(cancelledRecord);
  mockReactivatePublicHoliday.mockResolvedValue(storedRecord);
  mockRefreshAndPersist.mockResolvedValue(undefined);
});

describe("createHoliday attendance refresh", () => {
  const INPUT = {
    name: "National Day",
    dateFrom: "2026-11-02",
    dateTo: "2026-11-04",
    reason: null,
    createdById: CREATED_BY,
  };

  it("refreshes every non-weekend date of the created holiday", async () => {
    const result = await createHoliday(INPUT);

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

  it("skips Friday and Saturday", async () => {
    // 2026-11-06 Friday, 11-07 Saturday, 11-08 Sunday (a working day).
    mockCreatePublicHoliday.mockResolvedValue({
      ...storedRecord,
      dateFrom: "2026-11-06",
      dateTo: "2026-11-08",
    });

    const result = await createHoliday({
      ...INPUT,
      dateFrom: "2026-11-06",
      dateTo: "2026-11-08",
    });

    expect(mockRefreshAndPersist.mock.calls.map((call) => call[0])).toEqual([
      "2026-11-08",
    ]);
    expect(
      result.ok === true && result.attendanceRefresh.attemptedDates,
    ).toBe(1);
  });

  it("does not process future dates", async () => {
    mockCreatePublicHoliday.mockResolvedValue({
      ...storedRecord,
      dateFrom: "2099-01-05",
      dateTo: "2099-01-09",
    });

    const result = await createHoliday({
      ...INPUT,
      dateFrom: "2099-01-05",
      dateTo: "2099-01-09",
    });

    expect(mockRefreshAndPersist).not.toHaveBeenCalled();
    expect(
      result.ok === true && result.attendanceRefresh,
    ).toEqual({ attemptedDates: 0, failedDates: [] });
  });

  it("collects per-date failures without hiding them", async () => {
    mockRefreshAndPersist
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(undefined);

    const result = await createHoliday(INPUT);

    expect(result.ok).toBe(true);
    expect(mockRefreshAndPersist).toHaveBeenCalledTimes(3);
    expect(
      result.ok === true && result.attendanceRefresh,
    ).toEqual({ attemptedDates: 3, failedDates: ["2026-11-02"] });
  });
});

describe("updateHoliday attendance refresh", () => {
  it("refreshes the union of the old and new date ranges", async () => {
    // Existing holiday: Mon 11-02 .. Tue 11-03.
    // Updated to:    Wed 11-04 .. Thu 11-05. Union span: 11-02 .. 11-05.
    mockGetPublicHoliday.mockResolvedValue({
      ...storedRecord,
      dateFrom: "2026-11-02",
      dateTo: "2026-11-03",
    });
    mockUpdatePublicHoliday.mockResolvedValue({
      ...storedRecord,
      dateFrom: "2026-11-04",
      dateTo: "2026-11-05",
    });

    const result = await updateHoliday(BigInt(1), {
      name: "National Day",
      dateFrom: "2026-11-04",
      dateTo: "2026-11-05",
      reason: null,
    });

    expect(result.ok).toBe(true);
    expect(mockRefreshAndPersist.mock.calls.map((call) => call[0])).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
  });
});

describe("cancelHoliday and reactivateHoliday attendance refresh", () => {
  it("refreshes the holiday range after cancellation", async () => {
    const result = await cancelHoliday(BigInt(1), {
      reason: "Postponed",
      cancelledById: CANCELLED_BY,
    });

    expect(result.ok).toBe(true);
    expect(mockRefreshAndPersist).toHaveBeenCalledTimes(3);
    expect(
      result.ok === true && result.attendanceRefresh.failedDates,
    ).toEqual([]);
  });

  it("refreshes the holiday range after reactivation", async () => {
    mockGetPublicHoliday.mockResolvedValue(cancelledRecord);

    const result = await reactivateHoliday(BigInt(1), {
      reactivatedById: CANCELLED_BY,
    });

    expect(result.ok).toBe(true);
    expect(mockRefreshAndPersist).toHaveBeenCalledTimes(3);
  });
});
