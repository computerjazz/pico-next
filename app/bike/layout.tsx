import { getRedis, REDIS_KEYS } from "@/lib/redis";
import BikeTabs from "./BikeTabs";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const redis = await getRedis();
  const pulseCount = await redis.get(REDIS_KEYS.BIKE_PULSE_COUNT);
  return (
    <BikeTabs pulseCount={parseInt(pulseCount ?? "0")}>{children}</BikeTabs>
  );
}
