"use server";

import { db } from "@/db";
import { devices } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function renameDevice({
  deviceId,
  name,
}: {
  deviceId: string;
  name: string;
}) {
  await db
    .update(devices)
    .set({
      name,
    })
    .where(eq(devices.deviceId, deviceId));

  return { success: true };
}
