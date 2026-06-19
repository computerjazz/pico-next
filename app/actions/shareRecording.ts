"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { getDeviceAccess } from "@/lib/access";
import { eq } from "drizzle-orm";

export async function shareRecording({ recordingId }: { recordingId: string }) {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    throw new Error("Unauthorized");
  }

  const recording = await db.query.recordings.findFirst({
    where: (r, { eq }) => eq(r.id, recordingId),
    with: {
      device: true,
    },
  });

  const device = recording?.device;

  if (!recording || !device) {
    throw new Error("Recording/device not found");
  }

  const { isOwner, isShare } = await getDeviceAccess({
    deviceId: device.deviceId,
    userId: sessionUserId,
  });

  const isAuthorized = isOwner || isShare;
  if (!isAuthorized) {
    throw new Error("Unauthorized: You do not own this recording");
  }
  await db
    .update(recordings)
    .set({
      isShared: true,
    })
    .where(eq(recordings.id, recordingId));
}
