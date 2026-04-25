import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import os from "os";
import path from "path";
import { execSync, spawn } from "child_process";
import { getAnsweringMachineDir } from "@/app/api/answering-machine/utils";

const telegramToken = process.env.TELEGRAM_TOKEN;

// send a voice note (OGG/OPUS)
export async function sendVoiceToChat(
  filePath: string,
  options?: { fadeOutDuration: number; chatIds: string[] },
) {
  console.log("Telegram: sendvoice");

  const form = new FormData();

  // Ensure the file extension is .ogg for voice
  const outVoicePath = path.join(
    os.tmpdir(),
    "tg_voice_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2) +
      ".ogg",
  );

  let durationSec = 0;
  // Speech-focused processing for phone playback:
  // band-limit to voice range, compress dynamics, then normalize loudness.
  const speechFilter =
    "highpass=f=120,lowpass=f=4200,acompressor=threshold=-24dB:ratio=3:attack=20:release=250:makeup=6,loudnorm=I=-16:TP=-1.5:LRA=7";
  let finalFilter = speechFilter;

  const fadeDurationSec = options?.fadeOutDuration ?? 0;
  const hasFade = fadeDurationSec > 0;
  if (hasFade) {
    durationSec = parseFloat(
      execSync(
        `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`,
      ).toString(),
    );
    console.log("Duration:", durationSec);
    const fadeStart = durationSec - fadeDurationSec;
    finalFilter = `${speechFilter},afade=t=out:st=${fadeStart}:d=${fadeDurationSec}`;
  }
  try {
    // ffmpeg: mono, 48kHz sample rate, opus codec, 64k bitrate
    execSync(
      `ffmpeg -y -i "${filePath}" -af "${finalFilter}" -ac 1 -ar 48000 -c:a libopus -b:a 64k "${outVoicePath}"`,
    );
  } catch (err) {
    throw new Error("Failed to convert to OGG/OPUS for Telegram voice: " + err);
  }

  console.log("Telegram: sending", outVoicePath);

  if (!telegramToken) {
    throw new Error(`Missing Telegram token`);
  }

  const chatIds = options?.chatIds ?? [];

  const responses = await Promise.all(
    chatIds?.map(async (chatId) => {
      form.append("chat_id", chatId);
      form.append("voice", fs.createReadStream(outVoicePath));

      const resp = await fetch(
        `https://api.telegram.org/bot${telegramToken}/sendVoice`,
        {
          method: "POST",
          body: form,
        },
      );
      return resp.json();
    }),
  );

  return responses;
}

// send an audio file (MP3)
export async function sendAudio(filePath: string, chatId: string) {
  const form = new FormData();

  if (!chatId || !telegramToken) {
    throw new Error(
      `Missing Telegram ${!chatId && "chatId"} ${!telegramToken && "token"}`,
    );
  }
  form.append("chat_id", chatId);
  form.append("audio", fs.createReadStream(filePath));

  const resp = await fetch(
    `https://api.telegram.org/bot${telegramToken}/sendAudio`,
    {
      method: "POST",
      body: form,
    },
  );
  return resp.json();
}

export function getFilePath({
  fileId,
  ext = "mp3",
  deviceId,
}: {
  fileId: string;
  ext?: string;
  deviceId: string;
}) {
  return path.join(getAnsweringMachineDir({ deviceId }), `${fileId}.${ext}`);
}

export async function downloadAndConvertVoice({
  fileId,
  deviceId,
}: {
  fileId: string;
  deviceId: string;
}) {
  const token = process.env.TELEGRAM_TOKEN;
  console.log("downloading voice");
  // --- Step 1: get file path from Telegram ---
  const fileUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
  const getFileRes = await fetch(fileUrl);
  const fileData = (await getFileRes.json()) as {
    result: { file_path: string };
  };
  const filePath = fileData.result.file_path;

  // --- Step 2: download OGG file to disk ---
  const oggRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
  );
  const arrayBuffer = await oggRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const inputOggPath = getFilePath({ fileId, ext: "ogg", deviceId });

  fs.writeFileSync(inputOggPath, buffer);
  console.log("wrote ogg file", inputOggPath);
  // --- Step 3: convert OGG -> MP3 using ffmpeg ---
  const outputMp3Path = getFilePath({ fileId, ext: "mp3", deviceId });
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      inputOggPath, // input file is our downloaded OGG
      "-af",
      "compand=attacks=0.3:decays=0.8:points=-80/-900|-40/-20|-20/-6|0/0:soft-knee=6:gain=8:volume=0,loudnorm=I=-16:TP=-1.5:LRA=11",
      "-acodec",
      "libmp3lame",
      "-ab",
      "128k",
      "-y",
      outputMp3Path,
    ]);

    ffmpeg.stdout.on("data", (data) => console.log(data.toString()));
    ffmpeg.stderr.on("data", (data) => console.log(data.toString()));

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
  console.log("wrote mp3 file", outputMp3Path);

  return outputMp3Path;
}

export async function sendMessageToChat({
  text,
  chatId,
}: {
  text: string;
  chatId: string;
}) {
  const resp = await fetch(
    `https://api.telegram.org/bot${telegramToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    },
  );

  const data = await resp.json();
  return { data };
}
