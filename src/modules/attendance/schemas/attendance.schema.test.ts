import { describe, it, expect } from "vitest";
import {
  sessionFormSchema,
  attendanceMarkSchema,
  attendanceBatchSchema,
  headcountSchema,
} from "./attendance.schema";

const UUID_A = "3d90aa15-457c-4993-aab5-308f44244c85";
const UUID_B = "8c43d1b4-603d-4207-8d3e-3055cfb1dd84";
const UUID_C = "0868d48c-63f2-4623-8c82-1017436d22d4";

describe("sessionFormSchema", () => {
  it("accepts a valid session", () => {
    const parsed = sessionFormSchema.parse({
      service_type_id: UUID_A,
      service_date: "2026-07-26",
    });
    expect(parsed.service_date).toBe("2026-07-26");
    expect(parsed.title).toBeUndefined();
  });

  it("requires a service type", () => {
    expect(
      sessionFormSchema.safeParse({ service_type_id: "", service_date: "2026-07-26" }).success,
    ).toBe(false);
  });

  it("rejects an invalid date", () => {
    expect(
      sessionFormSchema.safeParse({ service_type_id: UUID_A, service_date: "soon" }).success,
    ).toBe(false);
  });
});

describe("attendanceMarkSchema", () => {
  const valid = {
    session_id: UUID_A,
    member_id: UUID_B,
    status: "present",
    client_uuid: UUID_C,
    captured_offline: false,
  };

  it("accepts a valid mark", () => {
    expect(attendanceMarkSchema.parse(valid).status).toBe("present");
  });

  it("requires the client_uuid idempotency key", () => {
    const { client_uuid: _omitted, ...withoutKey } = valid;
    expect(attendanceMarkSchema.safeParse(withoutKey).success).toBe(false);
  });

  it("rejects a non-uuid idempotency key", () => {
    expect(attendanceMarkSchema.safeParse({ ...valid, client_uuid: "abc" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(attendanceMarkSchema.safeParse({ ...valid, status: "maybe" }).success).toBe(false);
  });

  it.each(["present", "absent", "excused", "late"])("accepts status %s", (status) => {
    expect(attendanceMarkSchema.safeParse({ ...valid, status }).success).toBe(true);
  });
});

describe("attendanceBatchSchema", () => {
  const mark = {
    session_id: UUID_A,
    member_id: UUID_B,
    status: "present",
    client_uuid: UUID_C,
    captured_offline: true,
  };

  it("accepts a batch", () => {
    expect(attendanceBatchSchema.parse({ marks: [mark] }).marks).toHaveLength(1);
  });

  it("rejects an empty batch", () => {
    expect(attendanceBatchSchema.safeParse({ marks: [] }).success).toBe(false);
  });

  it("caps batch size to bound a single request", () => {
    const tooMany = Array.from({ length: 501 }, () => mark);
    expect(attendanceBatchSchema.safeParse({ marks: tooMany }).success).toBe(false);
  });
});

describe("headcountSchema", () => {
  it("coerces a numeric string", () => {
    const parsed = headcountSchema.parse({
      session_id: UUID_A,
      category: "men",
      headcount: "120",
    });
    expect(parsed.headcount).toBe(120);
  });

  it("rejects negatives", () => {
    expect(
      headcountSchema.safeParse({ session_id: UUID_A, category: "men", headcount: "-3" })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(
      headcountSchema.safeParse({ session_id: UUID_A, category: "elders", headcount: 3 })
        .success,
    ).toBe(false);
  });
});
