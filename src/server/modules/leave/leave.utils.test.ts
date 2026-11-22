import { describe, expect, it } from "vitest";
import {
  findOverlappingLeave,
  isDateOnLeave,
  isDateWithinLeave,
  rangesOverlap,
} from "./leave.utils";

describe("rangesOverlap", () => {
  it("treats identical ranges as overlapping", () => {
    expect(rangesOverlap("2026-11-02", "2026-11-04", "2026-11-02", "2026-11-04")).toBe(
      true,
    );
  });

  it("treats ranges that only touch on one day as overlapping", () => {
    // Both ranges contain 2026-11-03, so they must not be allowed together.
    expect(rangesOverlap("2026-11-01", "2026-11-03", "2026-11-03", "2026-11-05")).toBe(
      true,
    );
  });

  it("treats a fully contained range as overlapping", () => {
    expect(rangesOverlap("2026-11-01", "2026-11-10", "2026-11-03", "2026-11-04")).toBe(
      true,
    );
  });

  it("treats back-to-back ranges as disjoint", () => {
    // 2026-11-03 (end) and 2026-11-04 (start) do not share a day.
    expect(rangesOverlap("2026-11-01", "2026-11-03", "2026-11-04", "2026-11-05")).toBe(
      false,
    );
  });

  it("treats clearly separated ranges as disjoint", () => {
    expect(rangesOverlap("2026-11-01", "2026-11-02", "2026-12-01", "2026-12-02")).toBe(
      false,
    );
  });
});

describe("findOverlappingLeave", () => {
  const leaves = [
    { dateFrom: "2026-11-01", dateTo: "2026-11-02" },
    { dateFrom: "2026-11-05", dateTo: "2026-11-07" },
    { dateFrom: "2026-11-10", dateTo: "2026-11-12" },
  ];

  it("returns null when the candidate fits in a free gap", () => {
    expect(findOverlappingLeave(leaves, "2026-11-03", "2026-11-04")).toBeNull();
  });

  it("returns the first period the candidate overlaps", () => {
    expect(findOverlappingLeave(leaves, "2026-11-07", "2026-11-11")).toEqual(
      leaves[1],
    );
  });

  it("returns null for an empty list", () => {
    expect(findOverlappingLeave([], "2026-11-01", "2026-11-30")).toBeNull();
  });
});

describe("date membership", () => {
  const leave = { dateFrom: "2026-11-05", dateTo: "2026-11-07" };

  it("includes both ends of the period", () => {
    expect(isDateWithinLeave(leave, "2026-11-05")).toBe(true);
    expect(isDateWithinLeave(leave, "2026-11-07")).toBe(true);
  });

  it("excludes days just outside the period", () => {
    expect(isDateWithinLeave(leave, "2026-11-04")).toBe(false);
    expect(isDateWithinLeave(leave, "2026-11-08")).toBe(false);
  });

  it("checks membership across a list of periods", () => {
    expect(isDateOnLeave([leave], "2026-11-06")).toBe(true);
    expect(isDateOnLeave([leave], "2026-11-09")).toBe(false);
    expect(isDateOnLeave([], "2026-11-06")).toBe(false);
  });
});
