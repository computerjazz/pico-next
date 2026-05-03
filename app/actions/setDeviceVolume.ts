"use server";

import { db } from "@/db";
import { devices } from "@/db/schema";
import { getRedis } from "@/lib/redis";
import { eq } from "drizzle-orm";

export async function setDeviceVolume({
  deviceId,
  volume,
}: {
  deviceId: string;
  volume: number;
}) {
  const redis = await getRedis();
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

  return { success: true };
}
