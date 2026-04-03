import fs, { mkdirSync } from "fs";
import path from "path";

export const ANSWERING_MACHINE_AUDIO_DIR = path.join(
  process.cwd(),
  "uploads",
  "sh0rtwave",
  "answering-machine",
);
mkdirSync(ANSWERING_MACHINE_AUDIO_DIR, { recursive: true });

export function getLatestInboundAudioFilePath() {
  if (!fs.existsSync(ANSWERING_MACHINE_AUDIO_DIR)) {
    throw new Error("Audio dir does not exist");
  }
  const files = fs
    .readdirSync(ANSWERING_MACHINE_AUDIO_DIR)
    .filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(ANSWERING_MACHINE_AUDIO_DIR, f)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const file = files[0];
  const filePath = file
    ? path.join(ANSWERING_MACHINE_AUDIO_DIR, file.name)
    : null;
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
