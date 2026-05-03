import { db } from "@/db";
import { devices, toggles } from "@/db/schema";
import { getRedis } from "@/lib/redis";
import { getGroupScore } from "@/lib/toggle-score";
import z from "zod";

const ShortwaveDevicePostBodySchema = z.object({
  volume: z.number().min(0).max(100).optional(),
});

const ToggleStatePostBodySchema = z.object({
  state: z.enum(["on", "off"]),
  groupId: z.string(),
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
    console.log("bad toggle state request!");
    return { error: "malformed body" };
  }

  const { state, groupId } = parsed.data;

  // make sure device exists, add it if needed
  const insertPromise = db
    .insert(devices)
    .values({
      deviceId,
      type: "toggle",
    })
    .onConflictDoNothing();

  const togglePromise = db.insert(toggles).values({
    state,
    groupId,
    deviceId,
  });

  const [redis] = await Promise.all([getRedis(), insertPromise, togglePromise]);

  const score = await getGroupScore(groupId);
  const deviceIds = score.devices.map((d) => d.deviceId);
  const allIds = [...deviceIds, groupId];
  await Promise.all(
    allIds.map(async (targetId) => {
      return redis.publish(
        "ws:commands",
        JSON.stringify({
          targetId: targetId,
          command: JSON.stringify({
            type: "toggle_state",
            groupId,
            phase: score.phase,
            activeDeviceId: score.activeDeviceId,
            asOf: score.asOf,
            devices: score.devices,
          }),
        }),
      );
    }),
  );
  return { success: true };
}
