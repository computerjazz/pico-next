"use server";

import { createWriteStream } from "fs";
import { getAnsweringMachineFilepath } from "../api/device/[id]/answering-machine/utils";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { RECORDING_SOURCE } from "@/lib/constants";
import { convertAudioToMp3, getAudioDuration } from "@/lib/audio";
import path from "path";
import os from "os";
import fs from "fs";
import { auth } from "@/auth";

export async function leaveMessage({
  deviceId,
  form,
}: {
  deviceId: string;
  form: FormData;
}) {
  const session = await auth();
  if (!session || !session.user) {
    throw new Error("Must be logged in to record audio");
  }
  const file = form.get("audio") as File | null;
  if (!file) {
    throw new Error("No audio file provided");
  }

  const device = await db.query.devices.findFirst({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
  });

  if (device?.userId !== session.user.id) {
    throw new Error("Cannot record a message for this device");
  }

  console.log("saving ", file.name);

  const tmpDir = path.join(os.tmpdir(), "web-recordings", deviceId);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const tmpFilepath = path.join(tmpDir, file.name);

  // Stream the file to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(tmpFilepath);
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.end(buffer);
  });

  const filenameArr = file.name.split(".");
  filenameArr.pop();
  const filename = filenameArr.join(".");

  const filepath = getAnsweringMachineFilepath({
    deviceId,
    ext: "mp3",
    fileId: filename,
  });

  await convertAudioToMp3({
    inputFilepath: tmpFilepath,
    outputFilepath: filepath,
  });
  const { durationMillis } = await getAudioDuration({ filepath });
  console.log("converted!!", filepath);
  if (durationMillis > 1000) {
    await db.insert(recordings).values({
      source: RECORDING_SOURCE.ANSWERING_MACHINE,
      deviceId,
      filepath,
      name: filename,
      durationMillis: String(durationMillis),
    });
  }

  return { ok: true, name: filename };
}
