import { getRedis } from "./redis";

export async function incrementBikePulseCount() {
  const redis = await getRedis();
  const key = "bike:pulseCount";
  const count = await redis.incr(key);
  return count;
}
