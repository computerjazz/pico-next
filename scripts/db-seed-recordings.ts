// db/seed.ts
import "./env";
import { recordings } from "../db/schema";
import { db } from "../db/index";
import fs from "fs";
import path from "path";
import { getAnsweringMachineDir } from "../app/api/device/[id]/answering-machine/utils";
import { RECORDING_SOURCE } from "../lib/constants";

async function seedDb() {
  const deviceId = process.argv[2];

  const answeringMachineDir = getAnsweringMachineDir({ deviceId });
  if (!fs.existsSync(answeringMachineDir)) {
    throw new Error("Audio dir does not exist");
  }
  const files = fs
    .readdirSync(answeringMachineDir)
    .filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(answeringMachineDir, f)).mtime,
    }));

  await Promise.all(
    files.map(async (file) => {
      const filepath = path.join(answeringMachineDir, file.name);
      return db
        .insert(recordings)
        .values({
          deviceId,
          filepath,
          source: RECORDING_SOURCE.ANSWERING_MACHINE,
        })
        .onConflictDoNothing();
    }),
  );

  console.log("done");
}

seedDb();
