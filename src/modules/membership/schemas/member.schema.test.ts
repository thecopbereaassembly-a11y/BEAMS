import { describe, it, expect } from "vitest";
import { memberFormSchema, memberListQuerySchema } from "./member.schema";

const base = { first_name: "Kwame", last_name: "Mensah" };

describe("memberFormSchema", () => {
  it("accepts the minimum viable member", () => {
    const parsed = memberFormSchema.parse(base);
    expect(parsed.first_name).toBe("Kwame");
    expect(parsed.current_status).toBe("member"); // default applied
    expect(parsed.is_water_baptized).toBe(false);
  });

  it("requires first and last name", () => {
    const result = memberFormSchema.safeParse({ first_name: "", last_name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.first_name?.[0]).toMatch(/required/i);
      expect(errors.last_name?.[0]).toMatch(/required/i);
    }
  });

  it("treats empty optional strings as undefined, not empty values", () => {
    const parsed = memberFormSchema.parse({
      ...base,
      middle_name: "",
      primary_email: "",
      primary_phone: "",
      date_of_birth: "",
    });
    expect(parsed.middle_name).toBeUndefined();
    expect(parsed.primary_email).toBeUndefined();
    expect(parsed.primary_phone).toBeUndefined();
    expect(parsed.date_of_birth).toBeUndefined();
  });

  it.each([
    ["024 412 3456", true],
    ["0244123456", true],
    ["+233244123456", true],
    ["233244123456", true],
    ["12345", false],
    ["not-a-phone", false],
  ])("validates Ghana phone %s -> %s", (phone, valid) => {
    const result = memberFormSchema.safeParse({ ...base, primary_phone: phone });
    expect(result.success).toBe(valid);
  });

  it.each([
    ["GA-123-4567", true],
    ["ga-123-4567", true],
    ["GA-1234-5678", true],
    ["GA1234567", false],
  ])("validates Ghana Post GPS %s -> %s", (gps, valid) => {
    const result = memberFormSchema.safeParse({ ...base, gps_address: gps });
    expect(result.success).toBe(valid);
  });

  it("rejects an invalid email", () => {
    const result = memberFormSchema.safeParse({ ...base, primary_email: "nope@" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown membership status", () => {
    const result = memberFormSchema.safeParse({ ...base, current_status: "bishop" });
    expect(result.success).toBe(false);
  });
});

describe("memberListQuerySchema", () => {
  it("applies sensible defaults", () => {
    const q = memberListQuerySchema.parse({});
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(25);
    expect(q.sort).toBe("last_name");
    expect(q.order).toBe("asc");
  });

  it("coerces numeric strings from the URL", () => {
    const q = memberListQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(q.page).toBe(3);
    expect(q.pageSize).toBe(50);
  });

  it("caps pageSize to prevent unbounded queries", () => {
    expect(memberListQuerySchema.safeParse({ pageSize: "5000" }).success).toBe(false);
  });
});
