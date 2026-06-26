import { db } from "@/db";
import { devices, toggles } from "@/db/schema";
import { getRedis } from "@/lib/redis";
import {
  getScoreFromToggles,
  getTogglesFromGroupId,
  parseToggles,
} from "@/lib/toggle-score";
import { ToggleGroupScore } from "@/lib/types";
import { isTruthy } from "@/lib/utils";
import { eq } from "drizzle-orm";
import z from "zod";

const ShortwaveDevicePostBodySchema = z.object({
  volume: z.number().min(0).max(100).optional(),
});

type ToggleWsCommand = {
  type: "toggle_state";
} & ToggleGroupScore;

type ToggleWsPayload = {
  targetId: string;
  command: ToggleWsCommand;
};

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
    await db
      .update(devices)
      .set({
        volume: String(volume),
      })
      .where(eq(devices.deviceId, deviceId));

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

  const overrides: Record<string, string> = {
    [deviceId]: newState,
  };

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

  const latestToggleResults = await getTogglesFromGroupId({
    groupId,
    overrides,
  });

  const groupDeviceIds = latestToggleResults
    .map((r) => r.deviceId)
    .filter(isTruthy);

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

  const score = getScoreFromToggles({ toggles: parsedToggles });
  const baseWsCommand = {
    type: "toggle_state" as const,
    ...score,
    groupId,
  };

  const idsToNotify = [...groupDeviceIds, groupId];
  const payloads: ToggleWsPayload[] = idsToNotify.map((targetId) => {
    const isActive =
      score.devices.find((d) => d.deviceId === targetId && d.role === "active")
        ?.deviceId ?? null;

    const activeDeviceId = isActive
      ? targetId
      : (score.devices.find((d) => d.role === "active")?.deviceId ?? null);
    return {
      targetId,
      command: {
        ...baseWsCommand,
        activeDeviceId,
      },
    };
  });

  const redis = await getRedis();
  await Promise.all(
    payloads.map(async (payload) => {
      return redis.publish("ws:commands", JSON.stringify(payload));
    }),
  );

  // Update db after websocket event so that ws can be as snappy as possible
  const togglePromises = parsedToggles.map((parsedToggle) => {
    const { id: _id, deviceId, ...rest } = parsedToggle;
    if (!deviceId) return;
    return db
      .update(toggles)
      .set({
        ...rest,
        deviceId,
        updatedAt: new Date(),
      })
      .where(eq(toggles.deviceId, deviceId));
  });
  await Promise.all(togglePromises);

  return { success: true };
}
