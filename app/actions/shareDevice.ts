"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { deviceShares } from "@/db/schema";

export async function shareDevice({
  deviceId,
  userId,
}: {
  deviceId: string;
  userId?: string | null;
}) {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    throw new Error("must be logged in to rename device");
  }

  const ownerDevice = await db.query.devices.findFirst({
    where: (t, { eq, and }) =>
      and(eq(t.deviceId, deviceId), eq(t.userId, sessionUserId)),
  });

  if (!ownerDevice) {
    throw new Error("device not found with given owner");
  }

  const [share] = await db
    .insert(deviceShares)
    .values({
      deviceId,
      userId: userId || null,
    })
    .returning();

  return { success: true, share };
}
