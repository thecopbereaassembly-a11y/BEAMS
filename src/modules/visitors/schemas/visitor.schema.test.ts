import { describe, it, expect } from "vitest";
import { visitorFormSchema, visitorListQuerySchema } from "./visitor.schema";

describe("visitorFormSchema", () => {
  it("needs only a first name — capture what you can while they are with you", () => {
    const parsed = visitorFormSchema.parse({ first_name: "Ama" });
    expect(parsed.first_name).toBe("Ama");
    expect(parsed.last_name).toBeUndefined();
  });

  it("requires a first name", () => {
    expect(visitorFormSchema.safeParse({ first_name: "" }).success).toBe(false);
  });

  it("validates a Ghana phone number when given", () => {
    expect(visitorFormSchema.safeParse({ first_name: "Ama", phone: "024 412 3456" }).success).toBe(true);
    expect(visitorFormSchema.safeParse({ first_name: "Ama", phone: "12345" }).success).toBe(false);
  });

  it("allows an empty phone", () => {
    const parsed = visitorFormSchema.parse({ first_name: "Ama", phone: "" });
    expect(parsed.phone).toBeUndefined();
  });

  it("rejects a malformed email but allows an empty one", () => {
    expect(visitorFormSchema.safeParse({ first_name: "Ama", email: "nope@" }).success).toBe(false);
    expect(visitorFormSchema.parse({ first_name: "Ama", email: "" }).email).toBeUndefined();
  });

  it("rejects an invalid visit date", () => {
    expect(
      visitorFormSchema.safeParse({ first_name: "Ama", first_visit_on: "someday" }).success,
    ).toBe(false);
  });
});

describe("visitorListQuerySchema", () => {
  it("defaults to showing everyone", () => {
    expect(visitorListQuerySchema.parse({}).converted).toBe("all");
  });

  it("accepts the conversion filter", () => {
    expect(visitorListQuerySchema.parse({ converted: "no" }).converted).toBe("no");
  });

  it("rejects an unknown filter value", () => {
    expect(visitorListQuerySchema.safeParse({ converted: "maybe" }).success).toBe(false);
  });
});
