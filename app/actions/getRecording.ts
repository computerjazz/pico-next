"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import fs from "fs";

export async function getRecording({ recordingId }: { recordingId: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("must be logged in to listen to recording");
  }
  const recording = await db.query.recordings.findFirst({
    where: (r, { eq, and, isNull }) =>
      and(eq(r.id, recordingId), isNull(r.deletedAt)),
    with: {
      device: true,
    },
  });

  if (!recording) {
    throw new Error("Recording not found");
  }

  if (recording.device?.userId !== session.user.id) {
    throw new Error("Not authorized to access this recording");
  }

  const fileBuffer = fs.readFileSync(
    recording.filepathProcessed || recording.filepath,
  );
  return fileBuffer;
}
