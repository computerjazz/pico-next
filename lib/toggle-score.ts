import { db } from "@/db";
import { Toggle, toggles } from "@/db/schema";
import { isTruthy } from "./utils";
import { ToggleGroupScore } from "./types";

export function parseToggles({ toggles }: { toggles: Toggle[] }) {
  const parsedToggles = toggles.map((t) => {
    const isScoring = t.state === t.targetState;
    if (isScoring || t.scoringSince) {
      const now = Date.now();
      const latestScore = Math.floor(
        (now - (t.scoringSince?.getTime() || now)) / 1000,
      );
      // Device is scoring
      return {
        ...t,
        scoreSnapshot: String(Number(t.scoreSnapshot) + latestScore), // TODO: how to fix discrepency between auto-gen types from db (string) and actual intent (number)?
        scoringSince: isScoring ? new Date() : null,
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
        (Date.now() - new Date(r.scoringSince ?? Date.now()).getTime()) / 1000,
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

export async function getTogglesFromGroupId({
  groupId,
  overrides = {},
}: {
  groupId: string;
  overrides?: Record<string, string>;
}) {
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
  ).then((results) =>
    results.filter(isTruthy).map((r) => {
      const state =
        r.deviceId && overrides[r.deviceId] ? overrides[r.deviceId] : r.state;
      return { ...r, state };
    }),
  );

  const devicesWithResults = latestToggleResults.reduce((acc, cur) => {
    if (cur.deviceId) acc.add(cur.deviceId);
    return acc;
  }, new Set<string>());

  const itemsToInit = groupDeviceIds.filter(
    (deviceId) => !devicesWithResults.has(deviceId),
  );

  if (itemsToInit.length) {
    await Promise.all(
      itemsToInit.map(async (dId) => {
        // initialize any devices that don't already have a result

        const [toggle] = await db
          .insert(toggles)
          .values({
            deviceId: dId,
            state: overrides[dId] ?? "off",
            groupId,
          })
          .returning();
        latestToggleResults.push(toggle);
      }),
    );
  }

  return latestToggleResults;
}

export async function getGroupScore({ groupId }: { groupId: string }) {
  const latestToggleResults = await getTogglesFromGroupId({ groupId });
  const score = getScoreFromToggles({ toggles: latestToggleResults });
  return score;
}
