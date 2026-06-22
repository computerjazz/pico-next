import { db } from "@/db";
import { toggles } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

type ToggleEvent = {
  deviceId: string;
  state: string;
  updatedAt: Date;
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

export function scoreFromEvents(
  groupId: string,
  events: ToggleEvent[],
): ToggleGroupScore {
  const deviceIds = events.reduce((acc, cur) => {
    acc.add(cur.deviceId);
    return acc;
  }, new Set<string>());
  const deviceIdsArr = [...deviceIds];

  const otherDeviceMap = {
    [deviceIdsArr[0]]: deviceIdsArr[1],
    [deviceIdsArr[1]]: deviceIdsArr[0],
  };

  const result = events.reduce(
    (acc, cur) => {
      const { activeDeviceId, devices, prev } = acc;
      devices.set(cur.deviceId, {
        lastSeenState: cur.state,
        runningMs: devices.get(cur.deviceId)?.runningMs || 0,
        lastUpdatedAt: cur.updatedAt,
      });

      if (devices.size < 2 || !prev) {
        return {
          ...acc,
          prev: cur,
        };
      }

      const isIdle =
        cur.state == devices.get(otherDeviceMap[cur.deviceId])?.lastSeenState;
      // get diff
      if (isIdle) {
        const diffMs = cur.updatedAt.getTime() - prev.updatedAt.getTime();
        const activeDevice = activeDeviceId
          ? devices.get(activeDeviceId)
          : null;
        if (activeDevice && activeDeviceId) {
          // award ms to active device id
          const updatedMs = activeDevice.runningMs + diffMs;
          devices.set(activeDeviceId, {
            ...activeDevice,
            runningMs: updatedMs,
          });
        }
        return {
          ...acc,
          activeDeviceId: null,
          prev: cur,
        };
      } else {
        return {
          ...acc,
          activeDeviceId: cur.deviceId,
          prev: cur,
        };
      }
    },
    {
      prev: null as ToggleEvent | null,
      activeDeviceId: null as string | null,
      devices: new Map<
        string,
        { lastSeenState: string; runningMs: number; lastUpdatedAt: Date }
      >(),
    },
  );

  return {
    groupId,
    asOf: new Date().toISOString(),
    phase: result.activeDeviceId ? "contested" : "aligned",
    activeDeviceId: result.activeDeviceId,
    devices: Object.values([...result.devices]).map(
      ([deviceId, { lastSeenState, runningMs }]) => {
        const role =
          result.activeDeviceId === null
            ? "idle"
            : result.activeDeviceId === deviceId
              ? "active"
              : "challenger";
        const prevUpdated = result.prev?.updatedAt ?? new Date();
        const totalMs =
          role === "active"
            ? runningMs + (new Date().getTime() - prevUpdated.getTime())
            : runningMs;
        return {
          deviceId,
          role,
          points: Math.floor(totalMs / 1000),
          state: lastSeenState,
        };
      },
    ),
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

  const events = rows.filter((row): row is ToggleEvent => {
    return !!row.deviceId && !!row.state && !!row.updatedAt;
  });

  return scoreFromEvents(groupId, events);
}
