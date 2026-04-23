// db/seed.ts
import "./env";
import { devices, deviceChannels } from "../db/schema";
import { db } from "../db/index";

async function seedDb() {
  await db
    .insert(devices)
    .values({
      deviceId: process.argv[2],
      type: process.argv[3] || "shortwave",
    })
    .onConflictDoNothing();

  await db
    .insert(deviceChannels)
    .values({
      deviceId: process.argv[2],
      channelId: process.argv[4],
      type: process.argv[5] || "telegram",
    })
    .onConflictDoNothing();

  console.log("done");
}

seedDb();
