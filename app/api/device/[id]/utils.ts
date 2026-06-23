import { db } from "@/db";
import { devices, toggles } from "@/db/schema";
import { getRedis } from "@/lib/redis";
import { getScoreFromToggles, parseToggles } from "@/lib/toggle-score";
import { isTruthy } from "@/lib/utils";
import z from "zod";

const ShortwaveDevicePostBodySchema = z.object({
  volume: z.number().min(0).max(100).optional(),
});

const ToggleStatePostBodySchema = z.object({
  state: z.enum(["on", "off"]),
  groupId: z.string().optional().nullable(),
});

export async function onShortwaveDevicePost({
  deviceId,
  json,
}: {
  deviceId: string;
  json: Record<string, unknown>;
}) {
  const parsed = ShortwaveDevicePostBodySchema.safeParse(json);
  if (!parsed.success) {
    console.log("bad shortwave post request!");
    return { error: "malformed body" };
  }

  const redis = await getRedis();
  const { volume } = parsed.data;

  if (volume !== undefined) {
    await db.update(devices).set({
      volume: String(volume),
    });

    await redis.publish(
      "ws:commands",
      JSON.stringify({
        targetId: deviceId,
        command: JSON.stringify({
          type: "shortwave_config",
          volume: String(volume),
        }),
      }),
    );
  }

  return { success: true };
}

export async function onToggleDevicePost({
  json,
  deviceId,
}: {
  json: Record<string, unknown>;
  deviceId: string;
}) {
  const parsed = ToggleStatePostBodySchema.safeParse(json);
  if (!parsed.success) {
    console.error("ERR: bad toggle state request!");
    return { error: "malformed body" };
  }

  const { state: newState } = parsed.data;
  let { groupId } = parsed.data;

  if (!groupId) {
    // A toggle can only be a member of one group
    const group = await db.query.deviceGroups.findFirst({
      where: (t, { eq }) => eq(t.deviceId, deviceId),
    });
    groupId = group?.groupId;
  }

  if (!groupId) {
    console.error("ERR: missing group!");
    return {
      error: "missing group id",
    };
  }

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
      return r.deviceId === deviceId ? { ...r, state: newState } : r;
    }),
  );

  const initialItem = latestToggleResults[0];
  const firstState = initialItem?.state;
  const isAllSameState =
    !!firstState && latestToggleResults.every((t) => t.state === firstState);

  const nullTarget = initialItem?.targetState === null;
  // If all are currently green, target state flips
  const targetState = nullTarget
    ? newState
    : isAllSameState
      ? null
      : initialItem?.targetState;

  const { parsedToggles } = parseToggles({
    toggles: latestToggleResults.map((t) => ({ ...t, targetState })),
  });

  const togglePromises = parsedToggles.map((parsedToggle) =>
    db.insert(toggles).values(parsedToggle),
  );

  const redis = await getRedis();
  const allIds = [...groupDeviceIds, groupId];
  await Promise.all(
    allIds.map(async (targetId) => {
      return redis.publish(
        "ws:commands",
        JSON.stringify({
          targetId: targetId,
          command: JSON.stringify({
            type: "toggle_state",
            ...getScoreFromToggles({ toggles: parsedToggles }),
          }),
        }),
      );
    }),
  );
  // Update db after websocket event so that ws can be as snappy as possible
  await Promise.all(togglePromises);
  return { success: true };
}
