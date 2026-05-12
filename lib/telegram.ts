import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import path from "path";
import { spawn } from "child_process";
import { getAnsweringMachineDir } from "@/app/api/device/[id]/answering-machine/utils";
import { z } from "zod";
import { getTmpOggAudioFile } from "./audio";

const telegramToken = process.env.TELEGRAM_TOKEN;

export const TelegramVoiceJsonResponseSchema = z.object({
  ok: z.boolean(),
  error_code: z.number(),
  description: z.string(),
  parameters: z.object({
    migrate_to_chat_id: z.number(),
  }),
});

export type TelegramVoiceJsonResponse = z.infer<
  typeof TelegramVoiceJsonResponseSchema
>;

async function makeVoiceRequest({
  chatId,
  outVoicePath,
}: {
  chatId: string;
  outVoicePath: string;
}) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("voice", fs.createReadStream(outVoicePath));

  const resp = await fetch(
    `https://api.telegram.org/bot${telegramToken}/sendVoice`,
    {
      method: "POST",
      body: form,
    },
  );
  const respJson = await resp.json();
  return respJson as Record<string, unknown>;
}

// send a voice note (OGG/OPUS)
export async function sendVoiceToChat(
  filepath: string,
  options?: { chatIds: string[] },
) {
  console.log("Telegram: sendvoice");
  const { filepath: outVoicePath } = await getTmpOggAudioFile({ filepath });
  console.log("Telegram: sending", outVoicePath);

  if (!telegramToken) {
    throw new Error(`Missing Telegram token`);
  }

  const chatIds = options?.chatIds ?? [];
  const remappedChatIds = new Map<string, string>();

  const responses = await Promise.all(
    chatIds?.map(async (chatId) => {
      const resp = await makeVoiceRequest({ chatId, outVoicePath });
      const parsed = TelegramVoiceJsonResponseSchema.safeParse(resp);
      if (parsed.success && !parsed.data.ok) {
        console.log(`chat has been updated, sending to new chat id`);
        const newChatId = String(parsed.data.parameters.migrate_to_chat_id);
        // Update the channelId in deviceChannels to the newChatId
        const newResp = await makeVoiceRequest({
          chatId: newChatId,
          outVoicePath,
        });
        if ("ok" in newResp && newResp.ok) {
          remappedChatIds.set(chatId, newChatId);
        }
        return newResp;
      } else {
        return resp;
      }
    }),
  );

  return { responses, remappedChatIds };
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

  return { mp3: outputMp3Path, ogg: inputOggPath };
}

export async function sendMessageToChat({
  text,
  chatId,
  replyToMessageId,
}: {
  text: string;
  chatId: string;
  replyToMessageId?: string;
}) {
  const resp = await fetch(
    `https://api.telegram.org/bot${telegramToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }),
    },
  );

  const data = await resp.json();
  return { data };
}
