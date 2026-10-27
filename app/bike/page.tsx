import { getRedis, REDIS_KEYS } from "@/lib/redis";
import BikePage from "./BikePage";

export default async function Page() {
  const redis = await getRedis();
  const pulseCount = await redis.get(REDIS_KEYS.BIKE_PULSE_COUNT);
  return <BikePage pulseCount={parseInt(pulseCount ?? "0")} />;
}
