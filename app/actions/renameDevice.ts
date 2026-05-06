"use server";

import { db } from "@/db";
import { devices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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

  revalidatePath(`/device/${deviceId}`);

  return { success: true };
}
