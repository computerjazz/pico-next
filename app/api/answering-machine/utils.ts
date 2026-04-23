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

export function getLatestInboundAudioFilePath({
  deviceId,
}: {
  deviceId: string;
}) {
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
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const file = files[0];
  const filePath = file ? path.join(answeringMachineDir, file.name) : null;
  if (!filePath) {
    throw new Error("Audio file path does not exist");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".wav" ? "audio/wav" : "audio/mpeg";

  return {
    filePath,
    fileName: file.name,
    mtime: file.mtime,
    contentType,
  };
}
