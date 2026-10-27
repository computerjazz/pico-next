import { getRedis, REDIS_KEYS } from "./redis";

export async function incrementBikePulseCount() {
  const redis = await getRedis();
  const key = REDIS_KEYS.BIKE_PULSE_COUNT;
  const count = await redis.incr(key);
  return count;
}
