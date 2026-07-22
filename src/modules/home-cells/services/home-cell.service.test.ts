import { describe, it, expect } from "vitest";
import { cellHealth, meetingSummary } from "./home-cell.service";

describe("cellHealth", () => {
  it("flags an empty cell as needing attention", () => {
    expect(cellHealth(0)).toEqual({ label: "Empty", tone: "warning" });
  });

  it("marks a very small cell as small", () => {
    expect(cellHealth(3).label).toBe("Small");
  });

  it("marks a normal cell as healthy", () => {
    expect(cellHealth(10).label).toBe("Healthy");
    expect(cellHealth(4).label).toBe("Healthy");
    expect(cellHealth(20).label).toBe("Healthy");
  });

  it("suggests multiplication once a cell outgrows 20", () => {
    expect(cellHealth(21)).toEqual({ label: "Ready to multiply", tone: "success" });
  });
});

describe("meetingSummary", () => {
  it("combines day and time", () => {
    expect(meetingSummary({ meeting_day: "Wednesday", meeting_time: "18:30:00" })).toBe(
      "Wednesday · 18:30",
    );
  });

  it("handles a day with no time", () => {
    expect(meetingSummary({ meeting_day: "Friday", meeting_time: null })).toBe("Friday");
  });

  it("handles a time with no day", () => {
    expect(meetingSummary({ meeting_day: null, meeting_time: "19:00:00" })).toBe("19:00");
  });

  it("reports when nothing is scheduled", () => {
    expect(meetingSummary({ meeting_day: null, meeting_time: null })).toBe("No schedule set");
  });
});
