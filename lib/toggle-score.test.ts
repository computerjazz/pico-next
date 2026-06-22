import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGroupScore, scoreFromEvents } from "./toggle-score";

const { mockOrderBy, mockSelect } = vi.hoisted(() => {
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  return { mockOrderBy, mockSelect };
});

vi.mock("@/db", () => ({
  db: { select: mockSelect },
}));

function event(
  deviceId: string,
  state: string,
  updatedAtMs: number,
): { deviceId: string; state: string; updatedAt: Date } {
  return { deviceId, state, updatedAt: new Date(updatedAtMs) };
}

describe("scoreFromEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an aligned empty score when there are no events", () => {
    const score = scoreFromEvents("group-1", []);

    expect(score.groupId).toBe("group-1");
    expect(score.phase).toBe("aligned");
    expect(score.activeDeviceId).toBeNull();
    expect(score.devices).toEqual([]);
    expect(score.totalEvents).toBe(0);
    expect(score.asOf).toBe(new Date(10_000).toISOString());
  });

  it("tracks a single device as idle before a challenger appears", () => {
    const score = scoreFromEvents("group-1", [event("device-a", "on", 1_000)]);

    expect(score.phase).toBe("aligned");
    expect(score.devices).toEqual([
      { deviceId: "device-a", state: "on", role: "idle", points: 0 },
    ]);
  });

  it("stays aligned when both devices share the same state", () => {
    const score = scoreFromEvents("group-1", [
      event("device-a", "on", 1_000),
      event("device-b", "on", 2_000),
    ]);

    expect(score.phase).toBe("aligned");
    expect(score.activeDeviceId).toBeNull();
    expect(score.devices).toEqual([
      { deviceId: "device-a", state: "on", role: "idle", points: 0 },
      { deviceId: "device-b", state: "on", role: "idle", points: 0 },
    ]);
  });

  it("marks a mismatch as contested and accrues live points for the active device", () => {
    const score = scoreFromEvents("group-1", [
      event("device-a", "on", 1_000),
      event("device-b", "on", 2_000),
      event("device-a", "off", 3_000),
    ]);

    expect(score.phase).toBe("contested");
    expect(score.activeDeviceId).toBe("device-a");
    expect(score.devices).toEqual([
      { deviceId: "device-a", state: "off", role: "active", points: 7 },
      { deviceId: "device-b", state: "on", role: "challenger", points: 0 },
    ]);
  });

  it("awards elapsed contested time when devices realign", () => {
    const score = scoreFromEvents("group-1", [
      // device a turns on
      event("device-a", "on", 1_000),
      // device b turns on
      event("device-b", "on", 2_000),
      // device a turns off (blue)
      event("device-a", "off", 3_000),
      // device b turns off (a should be awarded points)
      event("device-b", "off", 6_000),
    ]);

    expect(score.phase).toBe("aligned");
    expect(score.activeDeviceId).toBeNull();
    expect(score.devices).toEqual([
      { deviceId: "device-a", state: "off", role: "idle", points: 3 },
      { deviceId: "device-b", state: "off", role: "idle", points: 0 },
    ]);
  });

  it("awards elapsed contested time after multiple toggles", () => {
    const score = scoreFromEvents("group-1", [
      // device a init
      event("device-a", "off", 1_000),
      // device b init
      event("device-b", "off", 1_000),
      // device a turns ON (blue)
      event("device-a", "on", 2_000),
      // device b turns ON (a should be awarded points)
      event("device-b", "on", 3_000),
      // device b starts earning points
      event("device-b", "off", 4_000),
      // devices align again, b should be awarded points
      event("device-b", "on", 5_000),
      // device a starts earning points
      event("device-a", "off", 6_000),
      // devices align again, a is awarded points
      event("device-b", "off", 7_000),
    ]);

    expect(score.phase).toBe("aligned");
    expect(score.activeDeviceId).toBeNull();
    expect(score.devices).toEqual([
      { deviceId: "device-a", state: "off", role: "idle", points: 2 },
      { deviceId: "device-b", state: "off", role: "idle", points: 1 },
    ]);
  });
});

describe("getGroupScore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads toggle rows for a group and ignores incomplete records", async () => {
    mockOrderBy.mockResolvedValueOnce([
      { deviceId: "device-a", state: "on", updatedAt: new Date(1_000) },
      { deviceId: null, state: "on", updatedAt: new Date(2_000) },
      { deviceId: "device-b", state: null, updatedAt: new Date(3_000) },
      { deviceId: "device-b", state: "on", updatedAt: new Date(4_000) },
    ]);

    const score = await getGroupScore("group-1");

    expect(mockSelect).toHaveBeenCalledOnce();
    expect(score.groupId).toBe("group-1");
    expect(score.totalEvents).toBe(2);
    expect(score.devices).toEqual([
      { deviceId: "device-a", state: "on", role: "idle", points: 0 },
      { deviceId: "device-b", state: "on", role: "idle", points: 0 },
    ]);
  });
});
