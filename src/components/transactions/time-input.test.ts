import { describe, expect, it } from "vitest";
import { normalizeTimeInput } from "./time-input";

describe("normalizeTimeInput", () => {
  it.each([
    ["14:32", "14:32"],
    ["9:5", "09:05"],
    ["930", "09:30"],
    ["1432", "14:32"],
    ["۱۴:۳۲", "14:32"],
    ["14.32", "14:32"],
    ["7", "07:00"],
    ["00:00", "00:00"],
    ["23:59", "23:59"],
  ])("%s → %s", (input, out) => expect(normalizeTimeInput(input)).toBe(out));
  it.each(["24:00", "12:60", "abc", "", "1:2:3", "12345"])("rejects %j", (input) =>
    expect(normalizeTimeInput(input)).toBeNull(),
  );
});
