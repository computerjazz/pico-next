import { getRedis, REDIS_KEYS } from "@/lib/redis";

export default async function Page() {
  const redis = await getRedis();
  const pulseCount = await redis.get(REDIS_KEYS.BIKE_PULSE_COUNT);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <h1 className="text-4xl font-bold mb-4">Bike Page</h1>
      <p className="text-lg text-gray-600">Welcome to the Bike Page!</p>
      <p className="text-lg text-gray-600">
        Current Pulse Count: {pulseCount ?? 0}
      </p>
    </div>
  );
}
