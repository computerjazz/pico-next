import { createClient } from "redis";

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

export const REDIS_KEYS = {
  LATEST_USPS_EMAILS: "latestUspsEmails",
  LATEST_EMAIL_RAW: "latestEmailRaw",
};
