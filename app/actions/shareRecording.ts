"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function shareRecording({ recordingId }: { recordingId: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const recording = await db.query.recordings.findFirst({
    where: (r, { eq }) => eq(r.id, recordingId),
    with: {
      device: true,
    },
  });

  if (!recording || !recording.device) {
    throw new Error("Recording not found");
  }

  if (recording.device.userId !== session.user.id) {
    throw new Error("Unauthorized: You do not own this recording");
  }

  await db
    .update(recordings)
    .set({
      isShared: true,
    })
    .where(eq(recordings.id, recordingId));
}
