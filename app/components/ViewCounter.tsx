import { getRedis } from "@/lib/redis";

async function ViewCounter({ id }: { id: string }) {
  const redis = await getRedis();

  const views = await redis.incr(id);

  return (
    <div className="mx-auto max-w-3xl text-center text-xs text-green-400/70">
      This page has been viewed <span className="text-green-200">{views}</span>{" "}
      times.
    </div>
  );
}

export default ViewCounter;
