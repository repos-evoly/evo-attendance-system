import { describe, expect, it } from "vitest";
import {
  findOverlappingAssignment,
  isShiftAssignmentOverlapping,
  isValidDateString,
  toDatabaseDate,
  toDateString,
} from "./shift-assignment.utils";

describe("isValidDateString", () => {
  it("accepts valid calendar dates in YYYY-MM-DD format", () => {
    expect(isValidDateString("2026-12-01")).toBe(true);
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true); // leap year
  });

  it("rejects non-calendar or malformed dates", () => {
    expect(isValidDateString("2026-02-29")).toBe(false); // 2026 is not leap year
    expect(isValidDateString("2026-04-31")).toBe(false); // April has 30 days
    expect(isValidDateString("2026/12/01")).toBe(false);
    expect(isValidDateString("invalid")).toBe(false);
    expect(isValidDateString(null)).toBe(false);
    expect(isValidDateString(123)).toBe(false);
  });
});

describe("toDateString and toDatabaseDate", () => {
  it("converts between Date and YYYY-MM-DD string consistently using UTC", () => {
    const str = "2026-12-01";
    const date = toDatabaseDate(str);
    expect(toDateString(date)).toBe(str);
  });
});

describe("isShiftAssignmentOverlapping", () => {
  it("treats identical ranges as overlapping", () => {
    expect(
      isShiftAssignmentOverlapping("2026-12-01", "2026-12-15", "2026-12-01", "2026-12-15"),
    ).toBe(true);
  });

  it("treats ranges that touch on the same boundary day as overlapping (inclusive boundaries)", () => {
    // Both assignments include 2026-12-15
    expect(
      isShiftAssignmentOverlapping("2026-12-01", "2026-12-15", "2026-12-15", "2026-12-31"),
    ).toBe(true);
  });

  it("allows adjacent assignments where the new one starts the day after the previous ends", () => {
    // Assignment A ends 2026-12-15; Assignment B starts 2026-12-16
    expect(
      isShiftAssignmentOverlapping("2026-12-01", "2026-12-15", "2026-12-16", "2026-12-31"),
    ).toBe(false);
  });

  it("allows clearly disjoint date ranges", () => {
    expect(
      isShiftAssignmentOverlapping("2026-12-01", "2026-12-10", "2027-01-01", "2027-01-15"),
    ).toBe(false);
  });

  it("treats an open-ended assignment (null endDate) as overlapping with any future assignment", () => {
    // Range A is ongoing from 2026-12-01; Range B is 2026-12-10 to 2026-12-20
    expect(
      isShiftAssignmentOverlapping("2026-12-01", null, "2026-12-10", "2026-12-20"),
    ).toBe(true);

    // Range A is ongoing from 2026-12-01; Range B is ongoing from 2027-01-01
    expect(
      isShiftAssignmentOverlapping("2026-12-01", null, "2027-01-01", null),
    ).toBe(true);
  });

  it("does not overlap when an earlier finite assignment ends before an ongoing assignment starts", () => {
    // Range A ends 2026-11-30; Range B is ongoing from 2026-12-01
    expect(
      isShiftAssignmentOverlapping("2026-11-01", "2026-11-30", "2026-12-01", null),
    ).toBe(false);
  });
});

describe("findOverlappingAssignment", () => {
  const existingAssignments = [
    { id: "101", startDate: "2026-12-01", endDate: "2026-12-15" },
    { id: "102", startDate: "2026-12-16", endDate: "2026-12-31" },
    { id: "103", startDate: "2027-02-01", endDate: null },
  ];

  it("returns null when candidate fits into a free gap", () => {
    expect(
      findOverlappingAssignment(existingAssignments, "2027-01-01", "2027-01-31"),
    ).toBeNull();
  });

  it("detects overlap with finite range", () => {
    const conflict = findOverlappingAssignment(
      existingAssignments,
      "2026-12-10",
      "2026-12-20",
    );
    expect(conflict).toEqual(existingAssignments[0]);
  });

  it("detects overlap with ongoing range", () => {
    const conflict = findOverlappingAssignment(
      existingAssignments,
      "2027-03-01",
      "2027-03-15",
    );
    expect(conflict).toEqual(existingAssignments[2]);
  });

  it("excludes self when updating an assignment (no false positive self-overlap)", () => {
    // When updating assignment 101, changing its shift or keeping its dates (2026-12-01 to 2026-12-15),
    // it must not collide with itself
    const conflict = findOverlappingAssignment(
      existingAssignments,
      "2026-12-01",
      "2026-12-15",
      "101",
    );
    expect(conflict).toBeNull();
  });

  it("detects collision with another record when updating an assignment", () => {
    // When updating assignment 101 to extend to 2026-12-20, it collides with assignment 102
    const conflict = findOverlappingAssignment(
      existingAssignments,
      "2026-12-01",
      "2026-12-20",
      "101",
    );
    expect(conflict).toEqual(existingAssignments[1]);
  });
});
