import { beforeAll, describe, expect, it } from "vitest";
import { signSession, verifySessionToken } from "./token";

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(48);
});

describe("session token", () => {
  it("round-trips the session version", async () => {
    expect(await verifySessionToken(await signSession({ v: 3 }))).toEqual({ v: 3 });
  });
  it("rejects tampered, foreign-key and missing tokens", async () => {
    const token = await signSession({ v: 1 });
    expect(await verifySessionToken(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    process.env.SESSION_SECRET = "y".repeat(48);
    expect(await verifySessionToken(token)).toBeNull();
  });
});
