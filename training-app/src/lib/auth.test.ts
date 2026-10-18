import { afterEach, describe, expect, it } from "vitest";
import { isAuthEnabled, isPublicPath, isValidToken, tokenFor } from "./auth";

describe("auth", () => {
  const orig = process.env.APP_PASSWORD;
  afterEach(() => {
    if (orig === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = orig;
  });
  it("APP_PASSWORD 未設定なら保護は無効", async () => {
    delete process.env.APP_PASSWORD;
    expect(isAuthEnabled()).toBe(false);
    expect(await isValidToken("anything")).toBe(false);
  });
  it("正しいトークンだけ通す", async () => {
    process.env.APP_PASSWORD = "secret";
    expect(isAuthEnabled()).toBe(true);
    const t = await tokenFor("secret");
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(t).not.toContain("secret");
    expect(await isValidToken(t)).toBe(true);
    expect(await isValidToken(await tokenFor("wrong"))).toBe(false);
    expect(await isValidToken(undefined)).toBe(false);
  });
  it("PWA に必要なパスは保護対象外", () => {
    expect(isPublicPath("/manifest.webmanifest")).toBe(true);
    expect(isPublicPath("/sw.js")).toBe(true);
    expect(isPublicPath("/icons/icon-192.png")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/api/coach")).toBe(false);
  });
});
