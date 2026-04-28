import { db } from "@/db";
import { toggles } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

type ToggleEvent = {
  deviceId: string;
  state: string;
  updatedAt: Date;
};

type DeviceState = {
  state: string;
  changedAtMs: number;
};

export type ToggleDeviceScore = {
  deviceId: string;
  state: string;
  role: "idle" | "active" | "challenger";
  points: number;
};

export type ToggleGroupScore = {
  groupId: string;
  asOf: string;
  phase: "aligned" | "contested";
  activeDeviceId: string | null;
  devices: ToggleDeviceScore[];
  totalEvents: number;
};

function getActiveDeviceId(states: Map<string, DeviceState>): string | null {
  if (states.size < 2) return null;
  const uniqueStates = new Set(Array.from(states.values()).map((v) => v.state));
  if (uniqueStates.size <= 1) return null;

  let winnerId: string | null = null;
  let winnerMs = -1;
  for (const [deviceId, value] of states.entries()) {
    if (value.changedAtMs > winnerMs) {
      winnerMs = value.changedAtMs;
      winnerId = deviceId;
    }
  }
  return winnerId;
}

function scoreFromEvents(groupId: string, events: ToggleEvent[]): ToggleGroupScore {
  const scoresMs = new Map<string, number>();
  const states = new Map<string, DeviceState>();

  let lastEventMs: number | null = null;
  let activeDeviceId: string | null = null;

  for (const event of events) {
    const nowMs = event.updatedAt.getTime();
    if (lastEventMs !== null && activeDeviceId) {
      scoresMs.set(
        activeDeviceId,
        (scoresMs.get(activeDeviceId) ?? 0) + (nowMs - lastEventMs),
      );
    }

    states.set(event.deviceId, {
      state: event.state,
      changedAtMs: nowMs,
    });
    scoresMs.set(event.deviceId, scoresMs.get(event.deviceId) ?? 0);

    activeDeviceId = getActiveDeviceId(states);
    lastEventMs = nowMs;
  }

  const asOfMs = Date.now();
  if (lastEventMs !== null && activeDeviceId) {
    scoresMs.set(
      activeDeviceId,
      (scoresMs.get(activeDeviceId) ?? 0) + (asOfMs - lastEventMs),
    );
  }

  const devices: ToggleDeviceScore[] = Array.from(states.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([deviceId, value]) => {
      const isActive = activeDeviceId === deviceId;
      const role = activeDeviceId === null ? "idle" : isActive ? "active" : "challenger";
      return {
        deviceId,
        state: value.state,
        role,
        points: Math.floor((scoresMs.get(deviceId) ?? 0) / 1000),
      };
    });

  return {
    groupId,
    asOf: new Date(asOfMs).toISOString(),
    phase: activeDeviceId ? "contested" : "aligned",
    activeDeviceId,
    devices,
    totalEvents: events.length,
  };
}

export async function getGroupScore(groupId: string) {
  const rows = await db
    .select({
      deviceId: toggles.deviceId,
      state: toggles.state,
      updatedAt: toggles.updatedAt,
    })
    .from(toggles)
    .where(eq(toggles.groupId, groupId))
    .orderBy(asc(toggles.updatedAt));

  const events: ToggleEvent[] = rows
    .filter((row): row is { deviceId: string; state: string; updatedAt: Date } => {
      return Boolean(row.deviceId && row.state && row.updatedAt);
    })
    .map((row) => ({
      deviceId: row.deviceId,
      state: row.state,
      updatedAt: row.updatedAt,
    }));

  return scoreFromEvents(groupId, events);
}
