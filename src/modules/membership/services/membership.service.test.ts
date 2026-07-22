import { describe, it, expect } from "vitest";
import { normalizeGhanaPhone, displayName, ageFrom } from "./membership.service";

describe("normalizeGhanaPhone", () => {
  it.each([
    ["0244123456", "+233244123456"],
    ["024 412 3456", "+233244123456"],
    ["233244123456", "+233244123456"],
    ["+233244123456", "+233244123456"],
    ["+233 24 412 3456", "+233244123456"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeGhanaPhone(input)).toBe(expected);
  });

  it("returns undefined for empty input", () => {
    expect(normalizeGhanaPhone(undefined)).toBeUndefined();
    expect(normalizeGhanaPhone("")).toBeUndefined();
  });
});

describe("displayName", () => {
  it("uses first and last name by default", () => {
    expect(
      displayName({ first_name: "Kwame", last_name: "Mensah", preferred_name: null }),
    ).toBe("Kwame Mensah");
  });

  it("prefers the preferred name when set", () => {
    expect(
      displayName({ first_name: "Kwabena", last_name: "Mensah", preferred_name: "KB" }),
    ).toBe("KB Mensah");
  });

  it("ignores a whitespace-only preferred name", () => {
    expect(
      displayName({ first_name: "Ama", last_name: "Owusu", preferred_name: "   " }),
    ).toBe("Ama Owusu");
  });
});

describe("ageFrom", () => {
  const now = new Date("2026-07-22T00:00:00Z");

  it("computes age from a birthday earlier in the year", () => {
    expect(ageFrom("1990-01-15", now)).toBe(36);
  });

  it("does not count a birthday that has not happened yet this year", () => {
    expect(ageFrom("1990-12-15", now)).toBe(35);
  });

  it("counts the birthday itself", () => {
    expect(ageFrom("1990-07-22", now)).toBe(36);
  });

  it("returns null when no date of birth is recorded", () => {
    expect(ageFrom(null, now)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(ageFrom("not-a-date", now)).toBeNull();
  });
});
