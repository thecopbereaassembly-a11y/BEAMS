import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, clientKey, __resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit("k", { limit: 3, windowMs: 1000 }).allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("k", { limit: 3, windowMs: 1000 });
    const result = rateLimit("k", { limit: 3, windowMs: 1000 });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key independently", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("a", { limit: 3, windowMs: 1000 });
    expect(rateLimit("a", { limit: 3, windowMs: 1000 }).allowed).toBe(false);
    expect(rateLimit("b", { limit: 3, windowMs: 1000 }).allowed).toBe(true);
  });

  it("reports remaining capacity", () => {
    expect(rateLimit("k", { limit: 5, windowMs: 1000 }).remaining).toBe(4);
    expect(rateLimit("k", { limit: 5, windowMs: 1000 }).remaining).toBe(3);
  });

  it("frees capacity once the window has passed", async () => {
    rateLimit("k", { limit: 1, windowMs: 50 });
    expect(rateLimit("k", { limit: 1, windowMs: 50 }).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(rateLimit("k", { limit: 1, windowMs: 50 }).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientKey(headers, "auth")).toBe("auth:1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(new Headers({ "x-real-ip": "9.9.9.9" }), "auth")).toBe("auth:9.9.9.9");
  });

  it("degrades safely when no client ip is present", () => {
    expect(clientKey(new Headers(), "auth")).toBe("auth:unknown");
  });

  it("separates scopes so auth and export limits do not share a budget", () => {
    const headers = new Headers({ "x-real-ip": "1.1.1.1" });
    expect(clientKey(headers, "auth")).not.toBe(clientKey(headers, "export"));
  });
});
