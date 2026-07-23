"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function claimDevice({ deviceId }: { deviceId: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("must be logged in to claim device");
  }
  await db
    .update(devices)
    .set({
      userId: session.user.id,
    })
    .where(and(eq(devices.deviceId, deviceId), isNull(devices.userId)));

  revalidatePath(`/shortwave/${deviceId}`);

  return { success: true };
}
