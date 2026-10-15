import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("keeps local paths with query strings", () => {
    expect(safeNextPath("/transactions?card=2")).toBe("/transactions?card=2");
  });
  it.each([undefined, null, "", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"])(
    "falls back to / for %s",
    (input) => expect(safeNextPath(input)).toBe("/"),
  );
});
