"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { devices, recordings } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function wipeDevice({ deviceId }: { deviceId: string }) {
  const session = await auth();
  const isAdmin = session?.user.role === "admin";
  if (!isAdmin) {
    throw new Error("must be admin to wipe device");
  }
  const removeUserPromise = db
    .update(devices)
    .set({
      userId: null,
    })
    .where(eq(devices.deviceId, deviceId));

  const deleteAllMessagesPromise = db
    .update(recordings)
    .set({
      deletedAt: new Date(),
    })
    .where(
      and(eq(recordings.deviceId, deviceId), isNull(recordings.deletedAt)),
    );

  await Promise.all([removeUserPromise, deleteAllMessagesPromise]);

  revalidatePath(`/shortwave/${deviceId}`);

  return { success: true };
}
