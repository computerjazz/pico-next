"use server";

import { auth } from "@/auth";
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
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    throw new Error("must be logged in to set device volume");
  }
  await Promise.all([
    db
      .update(devices)
      .set({
        volume: String(volume),
      })
      .where(eq(devices.deviceId, deviceId)),
    redis.publish(
      "ws:commands",
      JSON.stringify({
        targetId: deviceId,
        command: JSON.stringify({
          type: "shortwave_config",
          volume: String(volume),
        }),
      }),
    ),
  ]);
  return { success: true };
}
