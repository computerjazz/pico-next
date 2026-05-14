import { createClient, RedisClientType } from "redis";

const client = createClient({
  url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});

client.on("error", (err) => console.error("Redis error", err));

let isConnected = false;

export async function getRedis() {
  if (!isConnected) {
    await client.connect();
    isConnected = true;
  }
  return client;
}

let subscriberClient: RedisClientType | null = null;

export async function getRedisSubscriber() {
  if (!subscriberClient) {
    subscriberClient = (await getRedis()).duplicate();
    await subscriberClient.connect();
  }
  return subscriberClient;
}

export const REDIS_KEYS = {
  LATEST_USPS_EMAILS: "latestUspsEmails",
  LATEST_EMAIL_RAW: "latestEmailRaw",
  EMAIL_WEBHOOK_COUNT: "emailWebhookCount",
  LATEST_GMAIL_HISTORY_ID: "latestGmailHistoryId",
  LATEST_TELEGRAM_MESSAGE: "latestTelegramMessage",
  ACTIVE_JOBS: "activeJobs",
};
