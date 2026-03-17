import { getRedis } from "@/lib/redis";

export const revalidate = 0; // always fetch fresh data

async function ViewCounter() {
  const redis = await getRedis();

  const views = await redis.incr("homepage_views");

  return (
    <div className="mx-auto max-w-3xl text-center text-xs text-green-400/70">
      This page has been viewed <span className="text-green-200">{views}</span>{" "}
      times.
    </div>
  );
}

export default ViewCounter;
