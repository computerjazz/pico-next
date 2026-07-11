import { getRedis, REDIS_KEYS } from "./redis";
import z from "zod";

const ActiveJobsSchema = z.record(
  z.string(),
  z.object({ timestamp: z.number() }),
);

const JobSchema = z.object({
  type: z.string(),
  id: z.string(),
  payload: z
    .object({
      recordingId: z.string().optional(),
    })
    .optional(),
});

type ActiveJobsRecord = z.infer<typeof ActiveJobsSchema>;
type Job = z.infer<typeof JobSchema>;

async function getJobQueue() {
  const redis = await getRedis();
  const jobQueueStr = await redis.get(REDIS_KEYS.JOB_QUEUE);
  const jobQueue: unknown[] = JSON.parse(jobQueueStr || "[]");
  return jobQueue.filter((j): j is Job => {
    const isValidJob = JobSchema.safeParse(j).success;
    return isValidJob;
  });
}

async function setJobQueue({ jobQueue }: { jobQueue: Job[] }) {
  const redis = await getRedis();
  redis.set(REDIS_KEYS.JOB_QUEUE, JSON.stringify(jobQueue));
  return jobQueue;
}

export async function addToJobQueue(job: Job) {
  const jobQueue = await getJobQueue();
  jobQueue.push(job);
  return setJobQueue({ jobQueue });
}

export async function removeFromQueue(job: Job) {
  const jobQueue = await getJobQueue();
  const updatedQueue = jobQueue.filter((j) => j.id !== job.id);
  return setJobQueue({ jobQueue: updatedQueue });
}

export async function getNextJob() {
  const jobQueue = await getJobQueue();
  const nextJob = jobQueue.shift();
  return nextJob;
}

export async function getActiveJobs() {
  const redis = await getRedis();
  const jobsStr = await redis.get(REDIS_KEYS.ACTIVE_JOBS);
  const jobs = JSON.parse(jobsStr || "{}");
  const curRecordings = ActiveJobsSchema.safeParse(jobs);
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
