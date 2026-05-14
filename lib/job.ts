import { getRedis, REDIS_KEYS } from "./redis";
import z from "zod";

const ActiveJobsSchema = z.record(
  z.string(),
  z.object({ timestamp: z.number() }),
);

type ActiveJobsRecord = z.infer<typeof ActiveJobsSchema>;

async function getActiveJobs() {
  const redis = await getRedis();
  const curRecordings = ActiveJobsSchema.safeParse(
    JSON.parse((await redis.get(REDIS_KEYS.ACTIVE_JOBS)) ?? "{}"),
  );
  return curRecordings.data ?? {};
}

export async function setActiveJob(key: string) {
  const redis = await getRedis();
  const curData = await getActiveJobs();
  const updated: ActiveJobsRecord = {
    ...curData,
    [key]: { timestamp: Date.now() },
  };
  await redis.set(REDIS_KEYS.ACTIVE_JOBS, JSON.stringify(updated));
}

export async function clearActiveJob(key: string) {
  const redis = await getRedis();
  const curData = await getActiveJobs();
  const updated = Object.entries(curData).reduce((acc, [id, val]) => {
    if (id === key) return acc;
    acc[id] = val;
    return acc;
  }, {} as ActiveJobsRecord);
  await redis.set(REDIS_KEYS.ACTIVE_JOBS, JSON.stringify(updated));
}

export async function getIsAnyJobActive() {
  const curData = await getActiveJobs();
  return !!Object.keys(curData).length;
}

// Recordings won't be more than an hour
const STALE_THRESHOLD = 1000 * 60 * 60;

export async function cleanupActiveJobs() {
  const redis = await getRedis();
  const curData = await getActiveJobs();
  const updated = Object.entries(curData).reduce((acc, [id, val]) => {
    const diffMillis = Date.now() - val.timestamp;
    if (diffMillis < STALE_THRESHOLD) {
      acc[id] = val;
    }
    return acc;
  }, {} as ActiveJobsRecord);
  await redis.set(REDIS_KEYS.ACTIVE_JOBS, JSON.stringify(updated));
}
