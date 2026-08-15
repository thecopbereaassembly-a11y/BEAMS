import { describe, expect, it } from "vitest";
import {
  fieldForHeader,
  normalizeBoolean,
  normalizeGender,
  normalizeMarital,
  normalizeStatus,
  memberImportRowSchema,
} from "./member-import.schema";

describe("header mapping", () => {
  it("maps common header variants onto canonical fields", () => {
    expect(fieldForHeader("First Name")).toBe("first_name");
    expect(fieldForHeader("firstname")).toBe("first_name");
    expect(fieldForHeader("Surname")).toBe("last_name");
    expect(fieldForHeader("DOB")).toBe("date_of_birth");
    expect(fieldForHeader("Mobile Number")).toBe("primary_phone");
    expect(fieldForHeader("E-mail")).toBe("primary_email");
    expect(fieldForHeader("Membership No")).toBe("member_no");
    expect(fieldForHeader("Ghana Post GPS")).toBe("gps_address");
  });

  it("returns null for unrecognized headers", () => {
    expect(fieldForHeader("Favourite Colour")).toBeNull();
    expect(fieldForHeader("")).toBeNull();
  });
});

describe("value normalization", () => {
  it("coerces loose booleans", () => {
    expect(normalizeBoolean("Yes")).toBe(true);
    expect(normalizeBoolean("Y")).toBe(true);
    expect(normalizeBoolean("TRUE")).toBe(true);
    expect(normalizeBoolean("1")).toBe(true);
    expect(normalizeBoolean("No")).toBe(false);
    expect(normalizeBoolean("")).toBe(false);
  });

  it("normalizes gender shorthand", () => {
    expect(normalizeGender("M")).toBe("male");
    expect(normalizeGender("female")).toBe("female");
    expect(normalizeGender("unknown")).toBe("");
  });

  it("normalizes marital status", () => {
    expect(normalizeMarital("Married")).toBe("married");
    expect(normalizeMarital("nonsense")).toBe("");
  });

  it("maps friendly status words onto the enum", () => {
    expect(normalizeStatus("New convert")).toBe("new_convert");
    expect(normalizeStatus("Transferred out")).toBe("transferred_out");
    expect(normalizeStatus("active")).toBe("member");
    expect(normalizeStatus("")).toBe("member");
  });
});

describe("import row schema", () => {
  it("accepts a minimal valid row and defaults status to member", () => {
    const parsed = memberImportRowSchema.safeParse({
      first_name: "Kwame",
      last_name: "Mensah",
      current_status: "member",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.current_status).toBe("member");
      expect(parsed.data.is_water_baptized).toBe(false);
    }
  });

  it("accepts an optional member_no and a Ghana phone without spaces", () => {
    const parsed = memberImportRowSchema.safeParse({
      first_name: "Ama",
      last_name: "Owusu",
      member_no: "BEA-002",
      primary_phone: "0244123456",
      current_status: "member",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.member_no).toBe("BEA-002");
  });

  it("rejects a row missing the required last name", () => {
    const parsed = memberImportRowSchema.safeParse({
      first_name: "Kofi",
      last_name: "",
      current_status: "member",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const parsed = memberImportRowSchema.safeParse({
      first_name: "Yaa",
      last_name: "Asante",
      primary_email: "not-an-email",
      current_status: "member",
    });
    expect(parsed.success).toBe(false);
  });
});
