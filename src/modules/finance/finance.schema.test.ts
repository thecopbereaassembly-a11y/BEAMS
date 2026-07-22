import { describe, it, expect } from "vitest";
import { contributionFormSchema, expenditureFormSchema } from "./finance.schema";
import { ghs } from "./finance.constants";

const UUID = "3d90aa15-457c-4993-aab5-308f44244c85";
const base = {
  member_id: UUID,
  contribution_type_id: UUID,
  amount: "100",
  channel: "cash",
  contributed_on: "2026-07-22",
};

/**
 * Money validation is the part an auditor would care about, so these tests are
 * about refusing bad data rather than accepting good data.
 */
describe("contributionFormSchema", () => {
  it("accepts a valid cash contribution", () => {
    const parsed = contributionFormSchema.parse(base);
    expect(parsed.amount).toBe(100);
  });

  it("rejects a zero amount", () => {
    expect(contributionFormSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(contributionFormSchema.safeParse({ ...base, amount: "-50" }).success).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    expect(contributionFormSchema.safeParse({ ...base, amount: "abc" }).success).toBe(false);
  });

  it("rejects more than 2 decimal places", () => {
    expect(contributionFormSchema.safeParse({ ...base, amount: "10.999" }).success).toBe(false);
  });

  it("accepts exactly 2 decimal places", () => {
    expect(contributionFormSchema.parse({ ...base, amount: "10.99" }).amount).toBe(10.99);
  });

  it("requires the network when paid by Mobile Money", () => {
    const result = contributionFormSchema.safeParse({ ...base, channel: "momo" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.momo_network?.[0]).toMatch(/network/i);
    }
  });

  it("accepts MoMo when the network is given", () => {
    expect(
      contributionFormSchema.safeParse({ ...base, channel: "momo", momo_network: "mtn" }).success,
    ).toBe(true);
  });

  it("requires a member unless the gift is anonymous", () => {
    const result = contributionFormSchema.safeParse({ ...base, member_id: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.member_id?.[0]).toMatch(/anonymous/i);
    }
  });

  it("allows an anonymous gift with no member", () => {
    expect(
      contributionFormSchema.safeParse({ ...base, member_id: "", is_anonymous: true }).success,
    ).toBe(true);
  });

  it("rejects an invalid date", () => {
    expect(
      contributionFormSchema.safeParse({ ...base, contributed_on: "someday" }).success,
    ).toBe(false);
  });
});

describe("expenditureFormSchema", () => {
  const spend = { payee: "ECG", amount: "250.50", channel: "cash", spent_on: "2026-07-22" };

  it("accepts a valid expenditure", () => {
    expect(expenditureFormSchema.parse(spend).amount).toBe(250.5);
  });

  it("requires a payee", () => {
    expect(expenditureFormSchema.safeParse({ ...spend, payee: "" }).success).toBe(false);
  });

  it("rejects a zero amount", () => {
    expect(expenditureFormSchema.safeParse({ ...spend, amount: "0" }).success).toBe(false);
  });
});

describe("ghs", () => {
  it("formats an amount as Ghana Cedis", () => {
    expect(ghs(1500)).toContain("1,500");
    expect(ghs(1500)).toMatch(/GH|₵/);
  });

  it("formats zero and null safely", () => {
    expect(ghs(0)).toMatch(/0/);
    expect(ghs(null)).toMatch(/0/);
  });

  it("accepts a numeric string (as Postgres numeric returns)", () => {
    expect(ghs("250.50")).toContain("250.5");
  });
});
