// db/seed.ts
import "./env";
import { devices, deviceChannels } from "../db/schema";
import { db } from "../db/index";

async function seedDb() {
  await db
    .insert(devices)
    .values({
      deviceId: "sh0rtwave-alpha",
      type: "shortwave",
    })
    .onConflictDoNothing();

  await db
    .insert(deviceChannels)
    .values({
      deviceId: "sh0rtwave-alpha",
      channelId: "-5123240552",
      type: "telegram",
    })
    .onConflictDoNothing();

  console.log("done");
}

seedDb();
