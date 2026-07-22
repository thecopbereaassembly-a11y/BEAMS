import { describe, it, expect } from "vitest";
import { followupFormSchema, activityFormSchema } from "./followup.schema";

const UUID = "3d90aa15-457c-4993-aab5-308f44244c85";

describe("followupFormSchema", () => {
  it("accepts a follow-up about a member", () => {
    const parsed = followupFormSchema.parse({ subject_member_id: UUID });
    expect(parsed.subject_member_id).toBe(UUID);
    expect(parsed.reason).toBe("custom");
    expect(parsed.priority).toBe("normal");
  });

  it("accepts a follow-up about a visitor", () => {
    expect(followupFormSchema.safeParse({ subject_visitor_id: UUID }).success).toBe(true);
  });

  it("rejects a follow-up with no subject at all", () => {
    const result = followupFormSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.subject_member_id?.[0]).toMatch(/member or visitor/i);
    }
  });

  it("treats blank subject ids as absent, not invalid uuids", () => {
    const result = followupFormSchema.safeParse({
      subject_member_id: "",
      subject_visitor_id: "",
    });
    expect(result.success).toBe(false); // still no subject
  });

  it("rejects an unknown reason", () => {
    expect(
      followupFormSchema.safeParse({ subject_member_id: UUID, reason: "vibes" }).success,
    ).toBe(false);
  });

  it("rejects an unknown priority", () => {
    expect(
      followupFormSchema.safeParse({ subject_member_id: UUID, priority: "extreme" }).success,
    ).toBe(false);
  });

  it.each(["low", "normal", "high", "urgent"])("accepts priority %s", (priority) => {
    expect(
      followupFormSchema.safeParse({ subject_member_id: UUID, priority }).success,
    ).toBe(true);
  });
});

describe("activityFormSchema", () => {
  it("defaults to a phone call", () => {
    expect(activityFormSchema.parse({}).activity_type).toBe("call");
  });

  it.each(["call", "visit", "sms", "prayer", "note"])("accepts type %s", (activity_type) => {
    expect(activityFormSchema.safeParse({ activity_type }).success).toBe(true);
  });

  it("rejects an unknown activity type", () => {
    expect(activityFormSchema.safeParse({ activity_type: "telepathy" }).success).toBe(false);
  });
});
