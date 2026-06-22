import { describe, expect, it } from "vitest";

import { getJsonSizeBytes, isTruthy, getHrsMinSecFromMillis } from "./utils";

describe("utils", () => {
  it("getJsonSizeBytes returns UTF-8 byte length of JSON", () => {
    expect(getJsonSizeBytes({ ok: true })).toBe(11);
    expect(getJsonSizeBytes("café")).toBe(7);
  });

  it("isTruthy narrows nullable values", () => {
    expect(isTruthy("hello")).toBe(true);
    expect(isTruthy(null)).toBe(false);
  });

  it("getHrsMinSecFromMillis returns correct hours, minutes, and seconds", () => {
    // 0 ms
    expect(getHrsMinSecFromMillis({ millis: 0 })).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
    });

    // 1 second in ms
    expect(getHrsMinSecFromMillis({ millis: 1000 })).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 1,
    });

    // 1 minute in ms
    expect(getHrsMinSecFromMillis({ millis: 60 * 1000 })).toEqual({
      hours: 0,
      minutes: 1,
      seconds: 0,
    });

    // 1 hour in ms
    expect(getHrsMinSecFromMillis({ millis: 60 * 60 * 1000 })).toEqual({
      hours: 1,
      minutes: 0,
      seconds: 0,
    });

    // 1 hour, 30 minutes, 45 seconds
    const ms = (1 * 60 * 60 + 30 * 60 + 45) * 1000;
    expect(getHrsMinSecFromMillis({ millis: ms })).toEqual({
      hours: 1,
      minutes: 30,
      seconds: 45,
    });

    // Arbitrary non-aligned value
    expect(getHrsMinSecFromMillis({ millis: 3723200 })).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 3,
    });

    // Under 1 second (should round down to 0)
    expect(getHrsMinSecFromMillis({ millis: 999 })).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });
});
