import { db } from "@/db";
import { RECORDING_SOURCE } from "@/lib/constants";
import fs, { mkdirSync } from "fs";
import path from "path";

export function getAnsweringMachineDir({ deviceId }: { deviceId: string }) {
  const answeringMachineDir = path.join(
    process.cwd(),
    "uploads",
    "sh0rtwave",
    deviceId,
    "answering-machine",
  );
  mkdirSync(answeringMachineDir, { recursive: true });
  return answeringMachineDir;
}

export async function getLatestInboundAudioFilePath({
  deviceId,
}: {
  deviceId: string;
}) {
  const recording = await db.query.recordings.findFirst({
    orderBy: (fields, { desc }) => desc(fields.createdAt),
    where: (t, { eq, and }) =>
      and(
        eq(t.deviceId, deviceId),
        eq(t.source, RECORDING_SOURCE.ANSWERING_MACHINE),
      ),
  });

  if (!recording) {
    return null;
  }

  return {
    filePath: recording.filepath,
    fileName: recording.name,
    mtime: recording.createdAt,
    contentType: recording.contentType || undefined,
  };
}
