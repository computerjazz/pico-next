import { getRedis, REDIS_KEYS } from "@/lib/redis";
import BikeTabs from "./BikeTabs";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const redis = await getRedis();
  const [pulseCount, route] = await Promise.all([
    redis.get(REDIS_KEYS.BIKE_PULSE_COUNT),
    redis.get(REDIS_KEYS.BIKE_ROUTE),
  ]);
  return (
    <BikeTabs
      pulseCount={parseInt(pulseCount ?? "0")}
      route={route ? JSON.parse(route) : null}
    >
      {children}
    </BikeTabs>
  );
}
