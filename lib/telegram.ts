import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import os from "os";
import path from "path";
import { execSync } from "child_process";

// send a voice note (OGG/OPUS)
export async function sendVoice(filePath: string) {
  console.log("Telegram: sendvoice");

  const form = new FormData();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const token = process.env.TELEGRAM_TOKEN;

  // Ensure the file extension is .ogg for voice
  const outVoicePath = path.join(
    os.tmpdir(),
    "tg_voice_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2) +
      ".ogg",
  );

  const durationSec = parseFloat(
    execSync(
      `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    ).toString(),
  );

  console.log("Duration:", durationSec);
  const fadeDurationSec = 0.5;
  const fadeStart = durationSec - fadeDurationSec;
  try {
    // ffmpeg: mono, 48kHz sample rate, opus codec, 64k bitrate
    execSync(
      `ffmpeg -y -i "${filePath}" -af "afade=t=out:st=${fadeStart}:d=${fadeDurationSec}" -ac 1 -ar 48000 -c:a libopus -b:a 64k "${outVoicePath}"`,
    );
  } catch (err) {
    throw new Error("Failed to convert to OGG/OPUS for Telegram voice: " + err);
  }

  console.log("Telegram: sending", outVoicePath);

  if (!chatId || !token) {
    throw new Error(
      `Missing Telegram ${!chatId && "chatId"} ${!token && "token"}`,
    );
  }

  form.append("chat_id", chatId);
  form.append("voice", fs.createReadStream(outVoicePath));

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
    method: "POST",
    body: form,
  });
  return resp.json();
}

// send an audio file (MP3)
export async function sendAudio(filePath: string) {
  const form = new FormData();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const token = process.env.TELEGRAM_TOKEN;

  if (!chatId || !token) {
    throw new Error(
      `Missing Telegram ${!chatId && "chatId"} ${!token && "token"}`,
    );
  }
  form.append("chat_id", chatId);
  form.append("audio", fs.createReadStream(filePath));

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
    method: "POST",
    body: form,
  });
  return resp.json();
}
