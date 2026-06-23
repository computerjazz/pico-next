import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseToggles,
  getScoreFromToggles,
  scoreFromEvents,
} from "./toggle-score";
import { Toggle } from "@/db/schema";

const { mockSelect, mockQuery, mockFindMany } = vi.hoisted(() => {
  const mockOrderBy = vi.fn();
  const mockFindMany = vi.fn();
  const mockFindFirst = vi.fn();
  const mockQueryOptions = { findMany: mockFindMany, findFirst: mockFindFirst };
  const mockQuery = {
    deviceGroups: mockQueryOptions,
    toggles: mockQueryOptions,
  };
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  return { mockOrderBy, mockSelect, mockQuery, mockFindMany };
});

vi.mock("@/db", () => ({
  db: { select: mockSelect, query: mockQuery },
}));

function event(
  deviceId: string,
  state: string,
  updatedAtMs: number,
): { deviceId: string; state: string; updatedAt: Date } {
  return { deviceId, state, updatedAt: new Date(updatedAtMs) };
}

function getRandomId() {
  return `${Date.now() + Math.floor(Math.random() * 1000)}`;
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
    expect(score.asOf).toBe(new Date(10_000).toISOString());
  });

  it("tracks a single device as idle before a challenger appears", () => {
    const score = scoreFromEvents("group-1", [event("device-a", "on", 1_000)]);

    expect(score.phase).toBe("aligned");
    expect(score.devices).toEqual([
      {
        deviceId: "device-a",
        state: "on",
        role: "idle",
        points: 0,
        updatedAt: new Date(1_000),
      },
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
      {
        deviceId: "device-a",
        state: "on",
        role: "idle",
        points: 0,
        updatedAt: new Date(1_000),
      },
      {
        deviceId: "device-b",
        state: "on",
        role: "idle",
        points: 0,
        updatedAt: new Date(2_000),
      },
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
      {
        deviceId: "device-a",
        state: "off",
        role: "active",
        points: 7,
        updatedAt: new Date(3_000),
      },
      {
        deviceId: "device-b",
        state: "on",
        role: "challenger",
        points: 0,
        updatedAt: new Date(2_000),
      },
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
      {
        deviceId: "device-a",
        state: "off",
        role: "idle",
        points: 3,
        updatedAt: new Date(3_000),
      },
      {
        deviceId: "device-b",
        state: "off",
        role: "idle",
        points: 0,
        updatedAt: new Date(6_000),
      },
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
      {
        deviceId: "device-a",
        state: "off",
        role: "idle",
        points: 2,
        updatedAt: new Date(6_000),
      },
      {
        deviceId: "device-b",
        state: "off",
        role: "idle",
        points: 1,
        updatedAt: new Date(7_000),
      },
    ]);
  });
});

describe("parseToggles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000); // Use a controlled fake time
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds scoringSince when state matches targetState", () => {
    const toggles = [
      {
        deviceId: "device-x",
        state: "active",
        targetState: "active",
        scoreSnapshot: "5",
        scoringSince: null,
        id: getRandomId(),
        groupId: "test-group-id",
        updatedAt: new Date(),
      },
    ];
    const { parsedToggles } = parseToggles({ toggles });
    expect(parsedToggles[0].scoringSince).toBeInstanceOf(Date);
  });

  it("awards points and clears scoringSince when state mismatches and scoringSince is set", () => {
    const scoringStart = new Date(90_000);
    const toggles: Toggle[] = [
      {
        deviceId: "device-x",
        state: "idle",
        targetState: "active",
        scoreSnapshot: "10",
        scoringSince: scoringStart,
        id: getRandomId(),
        groupId: "test-group-id",
        updatedAt: new Date(),
      },
    ];
    const { parsedToggles } = parseToggles({ toggles });
    // Should accrue 10 seconds: 100_000 - 90_000 = 10_000ms = 10s
    expect(parsedToggles[0].scoringSince).toBeNull();
    expect(parsedToggles[0].scoreSnapshot).toBe("20");
  });

  it("does not modify toggles not scoring and not previously scoring", () => {
    const testToggle = {
      deviceId: "device-z",
      state: "off",
      targetState: "on",
      scoreSnapshot: "7",
      scoringSince: null,
      id: getRandomId(),
      groupId: "test-group-id",
      updatedAt: new Date(),
    };

    const toggles: Toggle[] = [testToggle];
    const { parsedToggles } = parseToggles({ toggles });
    expect(parsedToggles[0]).toEqual({
      deviceId: "device-z",
      state: "off",
      targetState: "on",
      scoreSnapshot: "7",
      scoringSince: null,
      id: testToggle.id,
      groupId: "test-group-id",
      updatedAt: testToggle.updatedAt,
    });
  });

  it("handles a three-player scenario and points/scores are correctly updated", () => {
    // Let's simulate all start at "off", target is "on" for all.
    // device-a is scoring (is "on", matches target), others aren't.
    // "scoringSince" enabled for a, null for b/c.
    const scoringStartA = new Date(90_000);
    const testToggles: Toggle[] = [
      {
        deviceId: "a",
        state: "off",
        targetState: "on",
        scoreSnapshot: "10",
        scoringSince: scoringStartA,
        id: getRandomId(),
        groupId: "three-team",
        updatedAt: new Date(),
      },
      {
        deviceId: "b",
        state: "off",
        targetState: "on",
        scoreSnapshot: "5",
        scoringSince: null,
        id: getRandomId(),
        groupId: "three-team",
        updatedAt: new Date(),
      },
      {
        deviceId: "c",
        state: "off",
        targetState: "on",
        scoreSnapshot: "8",
        scoringSince: null,
        id: getRandomId(),
        groupId: "three-team",
        updatedAt: new Date(),
      },
    ];

    // When parseToggles runs at 100000, "a" was 'scoring' for 10s.
    // So a's scoreSnapshot should be 20 and scoringSince becomes null, others unchanged.
    const { parsedToggles } = parseToggles({ toggles: testToggles });

    expect(parsedToggles).toHaveLength(3);

    const a = parsedToggles.find((t) => t.deviceId === "a");
    const b = parsedToggles.find((t) => t.deviceId === "b");
    const c = parsedToggles.find((t) => t.deviceId === "c");

    expect(a).toBeDefined();
    expect(a?.scoreSnapshot).toBe("20");
    expect(a?.scoringSince).toBeNull();

    expect(b).toBeDefined();
    expect(b?.scoreSnapshot).toBe("5");
    expect(b?.scoringSince).toBeNull();

    expect(c).toBeDefined();
    expect(c?.scoreSnapshot).toBe("8");
    expect(c?.scoringSince).toBeNull();
  });
});

describe("getScoreFromToggles", () => {
  it("gives aligned phase and idle role when all states equal", () => {
    const toggles = [
      {
        deviceId: "d1",
        state: "on",
        targetState: "on",
        scoreSnapshot: "42",
        scoringSince: null,
        groupId: "g1",
        id: getRandomId(),
        updatedAt: new Date(),
      },
      {
        deviceId: "d2",
        state: "on",
        targetState: "on",
        scoreSnapshot: "99",
        scoringSince: null,
        groupId: "g1",
        id: getRandomId(),
        updatedAt: new Date(),
      },
    ];
    const score = getScoreFromToggles({ toggles });
    expect(score.phase).toBe("aligned");
    // All should be role "idle"
    expect(score.devices.every((d) => d.role === "idle")).toBe(true);
    expect(score.groupId).toBe("g1");
    expect(score.activeDeviceId).toBeNull();
    expect(score.devices).toEqual([
      {
        deviceId: "d1",
        role: "idle",
        points: 42,
        state: "on",
        updatedAt: toggles[0].updatedAt,
      },
      {
        deviceId: "d2",
        role: "idle",
        points: 99,
        state: "on",
        updatedAt: toggles[1].updatedAt,
      },
    ]);
  });

  it("gives contested phase, sets active and challenger roles", () => {
    const toggles = [
      {
        deviceId: "devA",
        state: "on",
        targetState: "on",
        scoreSnapshot: "5",
        scoringSince: null,
        groupId: "grp42",
        id: getRandomId(),
        updatedAt: new Date(),
      },
      {
        deviceId: "devB",
        state: "off",
        targetState: "on",
        scoreSnapshot: "10",
        scoringSince: null,
        groupId: "grp42",
        id: getRandomId(),
        updatedAt: new Date(),
      },
    ];
    const score = getScoreFromToggles({ toggles });
    expect(score.phase).toBe("contested");
    expect(score.activeDeviceId).toBe("devA");
    // devA is active (state == targetState, but not all same state), devB is challenger
    expect(score.devices).toEqual([
      {
        deviceId: "devA",
        role: "active",
        points: 5,
        state: "on",
        updatedAt: toggles[0].updatedAt,
      },
      {
        deviceId: "devB",
        role: "challenger",
        points: 10,
        state: "off",
        updatedAt: toggles[1].updatedAt,
      },
    ]);
  });

  it("handles empty toggle list", () => {
    const score = getScoreFromToggles({ toggles: [] });
    expect(score.groupId).toBeUndefined();
    expect(score.phase).toBe("aligned");
    expect(score.activeDeviceId).toBeNull();
    expect(score.devices).toEqual([]);
  });
});
