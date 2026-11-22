import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShiftAssignmentRecord,
  getEmployeeStatus,
  getShiftAssignmentById,
  listEmployeeAssignmentPeriods,
  listShiftAssignments,
  shiftExists,
  updateShiftAssignmentRecord,
} from "./shift-assignment.repository";
import {
  createAssignment,
  listAssignments,
  updateAssignment,
} from "./shift-assignment.service";
import type { ShiftAssignmentRecord } from "./shift-assignment.types";

vi.mock("./shift-assignment.repository", () => ({
  listShiftAssignments: vi.fn(),
  getShiftAssignmentById: vi.fn(),
  listEmployeeAssignmentPeriods: vi.fn(),
  getEmployeeStatus: vi.fn(),
  shiftExists: vi.fn(),
  createShiftAssignmentRecord: vi.fn(),
  updateShiftAssignmentRecord: vi.fn(),
}));

const mockListShiftAssignments = vi.mocked(listShiftAssignments);
const mockGetShiftAssignmentById = vi.mocked(getShiftAssignmentById);
const mockListEmployeeAssignmentPeriods = vi.mocked(listEmployeeAssignmentPeriods);
const mockGetEmployeeStatus = vi.mocked(getEmployeeStatus);
const mockShiftExists = vi.mocked(shiftExists);
const mockCreateShiftAssignmentRecord = vi.mocked(createShiftAssignmentRecord);
const mockUpdateShiftAssignmentRecord = vi.mocked(updateShiftAssignmentRecord);

const sampleRecord: ShiftAssignmentRecord = {
  id: "1",
  employeeId: 5,
  employeeName: "Alice Smith",
  shiftId: 2,
  shiftName: "Morning Shift",
  timeIn: "09:00",
  timeOut: "15:00",
  allowanceMinutes: 15,
  startDate: "2026-12-01",
  endDate: "2026-12-31",
  createdAt: "2026-11-18T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEmployeeStatus.mockResolvedValue({ exists: true, isActive: true });
  mockShiftExists.mockResolvedValue(true);
  mockListEmployeeAssignmentPeriods.mockResolvedValue([]);
  mockCreateShiftAssignmentRecord.mockResolvedValue(sampleRecord);
  mockGetShiftAssignmentById.mockResolvedValue(sampleRecord);
  mockUpdateShiftAssignmentRecord.mockResolvedValue(sampleRecord);
});

describe("createAssignment validation", () => {
  it("creates a valid shift assignment successfully", async () => {
    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });

    expect(result.ok).toBe(true);
    expect(mockCreateShiftAssignmentRecord).toHaveBeenCalledWith({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
  });

  it("creates an ongoing shift assignment with null endDate", async () => {
    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-01",
      endDate: null,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects an invalid startDate format", async () => {
    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-13-45",
      endDate: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_DATE", message: expect.any(String) },
    });
    expect(mockCreateShiftAssignmentRecord).not.toHaveBeenCalled();
  });

  it("rejects an invalid endDate format", async () => {
    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-01",
      endDate: "not-a-date",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_DATE", message: expect.any(String) },
    });
    expect(mockCreateShiftAssignmentRecord).not.toHaveBeenCalled();
  });

  it("rejects an endDate earlier than startDate", async () => {
    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-15",
      endDate: "2026-12-10",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_DATE_RANGE", message: expect.any(String) },
    });
    expect(mockCreateShiftAssignmentRecord).not.toHaveBeenCalled();
  });

  it("rejects when the employee does not exist", async () => {
    mockGetEmployeeStatus.mockResolvedValue(null);

    const result = await createAssignment({
      employeeId: 999,
      shiftId: 2,
      startDate: "2026-12-01",
      endDate: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "EMPLOYEE_NOT_FOUND", message: expect.any(String) },
    });
    expect(mockCreateShiftAssignmentRecord).not.toHaveBeenCalled();
  });

  it("rejects when the employee is inactive", async () => {
    mockGetEmployeeStatus.mockResolvedValue({ exists: true, isActive: false });

    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-01",
      endDate: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "EMPLOYEE_INACTIVE", message: expect.any(String) },
    });
    expect(mockCreateShiftAssignmentRecord).not.toHaveBeenCalled();
  });

  it("rejects when the shift does not exist", async () => {
    mockShiftExists.mockResolvedValue(false);

    const result = await createAssignment({
      employeeId: 5,
      shiftId: 99,
      startDate: "2026-12-01",
      endDate: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "SHIFT_NOT_FOUND", message: expect.any(String) },
    });
    expect(mockCreateShiftAssignmentRecord).not.toHaveBeenCalled();
  });
});

describe("createAssignment overlap protection", () => {
  it("rejects an assignment that overlaps an existing assignment range", async () => {
    mockListEmployeeAssignmentPeriods.mockResolvedValue([
      {
        id: "10",
        employeeId: 5,
        shiftId: 1,
        startDate: "2026-12-01",
        endDate: "2026-12-15",
      },
    ]);

    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-10",
      endDate: "2026-12-20",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "OVERLAPPING_ASSIGNMENT", message: expect.any(String) },
    });
    expect(mockCreateShiftAssignmentRecord).not.toHaveBeenCalled();
  });

  it("rejects an assignment that touches the boundary day of an existing assignment (inclusive)", async () => {
    mockListEmployeeAssignmentPeriods.mockResolvedValue([
      {
        id: "10",
        employeeId: 5,
        shiftId: 1,
        startDate: "2026-12-01",
        endDate: "2026-12-15",
      },
    ]);

    // Starts on 2026-12-15, which is the last day of the existing assignment
    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-15",
      endDate: "2026-12-31",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("OVERLAPPING_ASSIGNMENT");
    expect(mockCreateShiftAssignmentRecord).not.toHaveBeenCalled();
  });

  it("allows adjacent assignments where the new assignment starts the day after the previous ends", async () => {
    mockListEmployeeAssignmentPeriods.mockResolvedValue([
      {
        id: "10",
        employeeId: 5,
        shiftId: 1,
        startDate: "2026-12-01",
        endDate: "2026-12-15",
      },
    ]);

    // Starts on 2026-12-16 (day after 2026-12-15) -> Allowed!
    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2026-12-16",
      endDate: "2026-12-31",
    });

    expect(result.ok).toBe(true);
    expect(mockCreateShiftAssignmentRecord).toHaveBeenCalledTimes(1);
  });

  it("rejects an assignment when an existing assignment is ongoing (null endDate)", async () => {
    mockListEmployeeAssignmentPeriods.mockResolvedValue([
      {
        id: "10",
        employeeId: 5,
        shiftId: 1,
        startDate: "2026-12-01",
        endDate: null,
      },
    ]);

    const result = await createAssignment({
      employeeId: 5,
      shiftId: 2,
      startDate: "2027-01-01",
      endDate: null,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("OVERLAPPING_ASSIGNMENT");
  });
});

describe("updateAssignment", () => {
  it("rejects update when assignment does not exist", async () => {
    mockGetShiftAssignmentById.mockResolvedValue(null);

    const result = await updateAssignment(BigInt(99), {
      shiftId: 2,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "ASSIGNMENT_NOT_FOUND", message: expect.any(String) },
    });
    expect(mockUpdateShiftAssignmentRecord).not.toHaveBeenCalled();
  });

  it("updates an assignment without falsely detecting itself as overlapping", async () => {
    // Current assignment is id "1" from 2026-12-01 to 2026-12-31
    mockGetShiftAssignmentById.mockResolvedValue(sampleRecord);
    mockListEmployeeAssignmentPeriods.mockResolvedValue([
      {
        id: "1",
        employeeId: 5,
        shiftId: 2,
        startDate: "2026-12-01",
        endDate: "2026-12-31",
      },
    ]);

    // Updating shiftId to 3 for the same dates should succeed without self-collision
    const result = await updateAssignment(BigInt(1), {
      shiftId: 3,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });

    expect(result.ok).toBe(true);
    expect(mockUpdateShiftAssignmentRecord).toHaveBeenCalledWith(BigInt(1), {
      shiftId: 3,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
  });

  it("rejects an update if the new dates collide with another assignment", async () => {
    mockGetShiftAssignmentById.mockResolvedValue(sampleRecord); // id: 1, dates: 2026-12-01 to 2026-12-31
    mockListEmployeeAssignmentPeriods.mockResolvedValue([
      {
        id: "1",
        employeeId: 5,
        shiftId: 2,
        startDate: "2026-12-01",
        endDate: "2026-12-31",
      },
      {
        id: "2",
        employeeId: 5,
        shiftId: 1,
        startDate: "2027-01-15",
        endDate: "2027-02-15",
      },
    ]);

    // Extending assignment 1 to 2027-01-20 collides with assignment 2
    const result = await updateAssignment(BigInt(1), {
      endDate: "2027-01-20",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "OVERLAPPING_ASSIGNMENT", message: expect.any(String) },
    });
    expect(mockUpdateShiftAssignmentRecord).not.toHaveBeenCalled();
  });
});

describe("listAssignments", () => {
  it("retrieves shift assignments through the repository", async () => {
    mockListShiftAssignments.mockResolvedValue([sampleRecord]);

    const result = await listAssignments(5);

    expect(mockListShiftAssignments).toHaveBeenCalledWith(5);
    expect(result).toEqual([sampleRecord]);
  });
});
