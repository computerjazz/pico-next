"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import fs from "fs";

export async function getRecording({ recordingId }: { recordingId: string }) {
  const session = await auth();

  const recording = await db.query.recordings.findFirst({
    where: (r, { eq, and, isNull }) =>
      and(eq(r.id, recordingId), isNull(r.deletedAt)),
    with: {
      device: true,
    },
  });

  if (!recording) {
    throw new Error(`Recording not found: ${recordingId}`);
  }

  const ownerId = recording.device?.userId;
  const userId = session?.user?.id;
  const isPublic = !!recording.device?.isPublic;
  const isOwner = userId && userId === ownerId;

  const canListen = isOwner || isPublic;

  if (!canListen) {
    throw new Error("Not authorized to access this recording");
  }

  const fileBuffer = fs.readFileSync(
    recording.filepathProcessed || recording.filepath,
  );
  return fileBuffer;
}
