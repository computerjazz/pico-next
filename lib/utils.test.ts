import { describe, expect, it } from "vitest";

import { getJsonSizeBytes, isTruthy } from "./utils";

describe("utils", () => {
  it("getJsonSizeBytes returns UTF-8 byte length of JSON", () => {
    expect(getJsonSizeBytes({ ok: true })).toBe(11);
    expect(getJsonSizeBytes("café")).toBe(7);
  });

  it("isTruthy narrows nullable values", () => {
    expect(isTruthy("hello")).toBe(true);
    expect(isTruthy(null)).toBe(false);
  });
});
