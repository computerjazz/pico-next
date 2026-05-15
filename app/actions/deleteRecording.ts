"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function deleteRecording({
  recordingId,
}: {
  recordingId: string;
}) {
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

  // delete the recording
  await db
    .update(recordings)
    .set({
      deletedAt: new Date(),
    })
    .where(eq(recordings.id, recordingId));

  revalidatePath("/device");
}
