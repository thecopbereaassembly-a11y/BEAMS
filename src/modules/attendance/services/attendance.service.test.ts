import { describe, it, expect } from "vitest";
import { attendanceRate, countedPresent } from "./attendance.service";

describe("attendanceRate", () => {
  it("computes a whole percentage", () => {
    expect(attendanceRate(50, 100)).toBe(50);
    expect(attendanceRate(1, 3)).toBe(33);
    expect(attendanceRate(2, 3)).toBe(67);
  });

  it("returns 0 when the roster is empty rather than dividing by zero", () => {
    expect(attendanceRate(0, 0)).toBe(0);
    expect(attendanceRate(5, 0)).toBe(0);
  });

  it("handles full attendance", () => {
    expect(attendanceRate(80, 80)).toBe(100);
  });
});

describe("countedPresent", () => {
  it("counts present and late as attending", () => {
    expect(countedPresent(["present", "late", "absent", "excused"])).toBe(2);
  });

  it("counts nothing when everyone is away", () => {
    expect(countedPresent(["absent", "excused"])).toBe(0);
  });

  it("handles an empty list", () => {
    expect(countedPresent([])).toBe(0);
  });
});
