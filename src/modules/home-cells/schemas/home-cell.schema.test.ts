import { describe, it, expect } from "vitest";
import {
  homeCellFormSchema,
  cellReportSchema,
  cellMemberSchema,
} from "./home-cell.schema";

const UUID = "3d90aa15-457c-4993-aab5-308f44244c85";

describe("homeCellFormSchema", () => {
  it("accepts a minimal cell", () => {
    const parsed = homeCellFormSchema.parse({ name: "Cell 3" });
    expect(parsed.name).toBe("Cell 3");
    expect(parsed.is_active).toBe(true);
  });

  it("requires a name", () => {
    const result = homeCellFormSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("treats blank leader selections as unset rather than invalid", () => {
    const parsed = homeCellFormSchema.parse({
      name: "Cell 1",
      leader_member_id: "",
      assistant_member_id: "",
    });
    expect(parsed.leader_member_id).toBeUndefined();
    expect(parsed.assistant_member_id).toBeUndefined();
  });

  it("rejects a malformed leader id", () => {
    const result = homeCellFormSchema.safeParse({ name: "Cell 1", leader_member_id: "abc" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid leader id", () => {
    const parsed = homeCellFormSchema.parse({ name: "Cell 1", leader_member_id: UUID });
    expect(parsed.leader_member_id).toBe(UUID);
  });

  it("rejects an invalid meeting day", () => {
    expect(homeCellFormSchema.safeParse({ name: "C", meeting_day: "Someday" }).success).toBe(false);
  });
});

describe("cellReportSchema", () => {
  it("coerces numeric strings from the form", () => {
    const parsed = cellReportSchema.parse({
      report_date: "2026-07-22",
      attendance_count: "14",
      visitors_count: "2",
      offering_amount: "125.50",
    });
    expect(parsed.attendance_count).toBe(14);
    expect(parsed.visitors_count).toBe(2);
    expect(parsed.offering_amount).toBe(125.5);
  });

  it("rejects negative counts", () => {
    const result = cellReportSchema.safeParse({
      report_date: "2026-07-22",
      attendance_count: "-1",
    });
    expect(result.success).toBe(false);
  });

  it("requires a valid report date", () => {
    expect(cellReportSchema.safeParse({ report_date: "" }).success).toBe(false);
    expect(cellReportSchema.safeParse({ report_date: "not-a-date" }).success).toBe(false);
  });

  it("defaults counts to zero", () => {
    const parsed = cellReportSchema.parse({ report_date: "2026-07-22" });
    expect(parsed.attendance_count).toBe(0);
    expect(parsed.offering_amount).toBe(0);
  });
});

describe("cellMemberSchema", () => {
  it("defaults the role to member", () => {
    expect(cellMemberSchema.parse({ member_id: UUID }).role).toBe("member");
  });

  it("rejects an unknown role", () => {
    expect(cellMemberSchema.safeParse({ member_id: UUID, role: "pastor" }).success).toBe(false);
  });
});
