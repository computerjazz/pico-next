import { db } from "@/db";
import { Toggle, toggles } from "@/db/schema";
import { isTruthy } from "./utils";
import { eq, asc } from "drizzle-orm";

type ToggleEvent = {
  deviceId: string;
  state: string;
  updatedAt: Date;
};

export type ToggleDeviceScore = {
  deviceId: string | null;
  state: string;
  role: "idle" | "active" | "challenger";
  points: number;
  updatedAt?: Date | null;
};

export type ToggleGroupScore = {
  groupId: string | null;
  asOf: string;
  phase: "aligned" | "contested";
  activeDeviceId: string | null;
  devices: ToggleDeviceScore[];
};

export function scoreFromEvents({
  groupId,
  events,
  includeInProgressScore = true,
}: {
  groupId: string;
  events: ToggleEvent[];
  includeInProgressScore?: boolean;
}): ToggleGroupScore {
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
      ([deviceId, { lastSeenState, runningMs, lastUpdatedAt }]) => {
        const role =
          result.activeDeviceId === null
            ? "idle"
            : result.activeDeviceId === deviceId
              ? "active"
              : "challenger";
        const prevUpdated = result.prev?.updatedAt ?? new Date();
        const totalMs =
          role === "active" && includeInProgressScore
            ? runningMs + (new Date().getTime() - prevUpdated.getTime())
            : runningMs;
        return {
          deviceId,
          role,
          points: Math.floor(totalMs / 1000),
          state: lastSeenState,
          updatedAt: lastUpdatedAt,
        };
      },
    ),
  };
}

export function parseToggles({ toggles }: { toggles: Toggle[] }) {
  const parsedToggles = toggles.map((t) => {
    const isScoring = t.state === t.targetState;
    if (isScoring) {
      // Device is scoring
      return {
        ...t,
        scoringSince: t.scoringSince || new Date(),
      };
    } else if (t.scoringSince) {
      // Device _was_ scoring but is no longer
      // calculate score and null out scoringSince
      const latestScore = Math.floor(
        (Date.now() - t.scoringSince.getTime()) / 1000,
      );
      return {
        ...t,
        scoringSince: null,
        scoreSnapshot: String(Number(t.scoreSnapshot) + latestScore), // TODO: how to fix discrepency between auto-gen types from db (string) and actual intent (number)?
      };
    } else {
      // device wasn't scoring and is still in unscoring state
      return t;
    }
  });

  return {
    parsedToggles,
  };
}

function getCurrentState({ toggles }: { toggles: Toggle[] }) {
  const initialToggle = toggles[0];
  const isAllSameState = toggles.every((t) => t.state === initialToggle?.state);
  return {
    isAllSameState,
    groupId: initialToggle?.groupId,
    targetState: initialToggle?.targetState,
  };
}

export function getScoreFromToggles({
  toggles,
}: {
  toggles: Toggle[];
}): ToggleGroupScore {
  const { isAllSameState, groupId } = getCurrentState({ toggles });
  return {
    groupId,
    phase: isAllSameState ? "aligned" : "contested",
    activeDeviceId: isAllSameState
      ? null
      : (toggles.find((r) => r.state === r.targetState)?.deviceId ?? null),
    asOf: new Date().toISOString(),
    devices: toggles.map((r) => {
      const isActive = r.state === r.targetState;
      const role = isAllSameState ? "idle" : isActive ? "active" : "challenger";
      const numSecondsSinceUpdated = Math.floor(
        (Date.now() - new Date(r.updatedAt ?? Date.now()).getTime()) / 1000,
      );

      const points =
        Number(r.scoreSnapshot) + (isActive ? numSecondsSinceUpdated : 0);

      return {
        deviceId: r.deviceId,
        role,
        points,
        state: r.state,
        updatedAt: r.updatedAt,
      };
    }),
  };
}

export async function getTogglesFromGroupId({ groupId }: { groupId: string }) {
  const groupDeviceIds = await db.query.deviceGroups
    .findMany({
      where: (t, { eq }) => eq(t.groupId, groupId),
    })
    .then((result) => result.map((dg) => dg.deviceId));

  const latestToggleResults = await Promise.all(
    groupDeviceIds.map((deviceId) =>
      db.query.toggles.findFirst({
        where: (t, { eq }) => eq(t.deviceId, deviceId),
        orderBy: (t, { desc }) => desc(t.updatedAt),
      }),
    ),
  ).then((results) => results.filter(isTruthy));

  return latestToggleResults;
}

export async function getGroupScore_deprecated({
  groupId,
  includeInProgressScore = true,
}: {
  groupId: string;
  includeInProgressScore?: boolean;
}) {
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

  return scoreFromEvents({ groupId, events, includeInProgressScore });
}

export async function getGroupScore({ groupId }: { groupId: string }) {
  const latestToggleResults = await getTogglesFromGroupId({ groupId });
  const score = getScoreFromToggles({ toggles: latestToggleResults });
  return score;
}
