import { describe, it, expect } from "vitest";
import { smsSegments, renderTemplate } from "./ports";

/**
 * Segment counting decides what the church actually gets billed, so it is worth
 * testing carefully: one stray emoji turns a 1-SMS message into 3.
 */
describe("smsSegments", () => {
  it("counts an empty message as zero", () => {
    expect(smsSegments("")).toBe(0);
  });

  it("counts a short GSM-7 message as one segment", () => {
    expect(smsSegments("Hello church")).toBe(1);
  });

  it("counts exactly 160 GSM-7 characters as one segment", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
  });

  it("counts 161 GSM-7 characters as two segments", () => {
    expect(smsSegments("a".repeat(161))).toBe(2);
  });

  it("uses 153-char parts for concatenated GSM-7 messages", () => {
    expect(smsSegments("a".repeat(306))).toBe(2);
    expect(smsSegments("a".repeat(307))).toBe(3);
  });

  it("drops to a 70-char limit when a unicode character appears", () => {
    expect(smsSegments(`${"a".repeat(70)}`)).toBe(1);
    expect(smsSegments(`${"a".repeat(70)}🙏`)).toBeGreaterThan(1);
  });

  it("treats an emoji-only message as unicode", () => {
    expect(smsSegments("🙏")).toBe(1);
    expect(smsSegments("🙏".repeat(71))).toBeGreaterThan(1);
  });
});

describe("renderTemplate", () => {
  it("substitutes a known variable", () => {
    expect(renderTemplate("Hi {{first_name}}!", { first_name: "Ama" })).toBe("Hi Ama!");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Hi {{ first_name }}!", { first_name: "Ama" })).toBe("Hi Ama!");
  });

  it("substitutes the same variable more than once", () => {
    expect(renderTemplate("{{name}} — {{name}}", { name: "Kofi" })).toBe("Kofi — Kofi");
  });

  it("leaves unknown placeholders visible rather than blanking them", () => {
    // A visible {{church}} is a bug someone will notice and fix; a silent blank
    // reads as a finished message and ships broken.
    expect(renderTemplate("Welcome to {{church}}", {})).toBe("Welcome to {{church}}");
  });

  it("leaves the placeholder when the value is null or empty", () => {
    expect(renderTemplate("Hi {{first_name}}", { first_name: null })).toBe("Hi {{first_name}}");
    expect(renderTemplate("Hi {{first_name}}", { first_name: "" })).toBe("Hi {{first_name}}");
  });

  it("returns the text unchanged when there are no placeholders", () => {
    expect(renderTemplate("Service at 9am", { first_name: "Ama" })).toBe("Service at 9am");
  });
});
