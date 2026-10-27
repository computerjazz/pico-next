"use server";

import { revalidatePath } from "next/cache";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export async function resetBikePulseCount() {
  const redis = await getRedis();
  await redis.set(REDIS_KEYS.BIKE_PULSE_COUNT, "0");

  revalidatePath(`/bike`);

  return { success: true };
}
