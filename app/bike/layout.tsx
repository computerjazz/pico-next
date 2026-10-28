import { getRedis, REDIS_KEYS } from "@/lib/redis";
import BikeTabs from "./BikeTabs";
import { BikeSessionProvider } from "../components/BikeSessionProvider";
import { MapProvider } from "../components/MapProvider";

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
    <BikeSessionProvider pulseCount={parseInt(pulseCount ?? "0")}>
      <MapProvider initialRoute={route ? JSON.parse(route) : null}>
        <BikeTabs>{children}</BikeTabs>
      </MapProvider>
    </BikeSessionProvider>
  );
}
