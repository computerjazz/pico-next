import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import path from "path";
import { spawn } from "child_process";
import { getAnsweringMachineDir } from "@/app/api/device/[id]/answering-machine/utils";
import { z } from "zod";
import { getTmpOggAudioFile } from "./audio";

function createTelegramBot() {
  const baseUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

  async function sendVoice({ body }: { body: FormData }) {
    const url = `${baseUrl}/sendVoice`;
    const resp = await fetch(url, {
      method: "POST",
      body,
    });
    return resp;
  }

  async function sendAudio({ body }: { body: FormData }) {
    const url = `${baseUrl}/sendAudio`;
    const resp = await fetch(url, {
      method: "POST",
      body,
    });
    return resp;
  }

  async function sendMessage({
    chatId,
    text,
    replyToMessageId,
  }: {
    chatId: string;
    text: string;
    replyToMessageId?: string;
  }) {
    const resp = await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }),
    });
    return resp;
  }

  async function updateMessageCaption({
    chatId,
    messageId,
    caption,
  }: {
    chatId: string;
    messageId: string;
    caption: string;
  }) {
    const resp = await fetch(`${baseUrl}/editMessageCaption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption,
      }),
    });
    return resp;
  }

  return {
    sendVoice,
    sendAudio,
    sendMessage,
    updateMessageCaption,
  };
}

const bot = createTelegramBot();

const TelegramSendVoiceResponseSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      username: z.string(),
    }),
    chat: z.object({
      id: z.number(),
      title: z.string(),
      type: z.string(),
    }),
    date: z.number(),
    voice: z.object({
      duration: z.number(),
      mime_type: z.string(),
      file_id: z.string(),
      file_unique_id: z.string(),
      file_size: z.number(),
    }),
  }),
});

const TelegramVoiceJsonResponseMigrateToChatSchema = z.object({
  ok: z.boolean(),
  error_code: z.number(),
  description: z.string(),
  parameters: z.object({
    migrate_to_chat_id: z.number(),
  }),
});

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

  const resp = await bot.sendVoice({ body: form });
  const respJson = await resp.json();
  console.log("sent voice, response:", JSON.stringify(respJson));
  return respJson as Record<string, unknown>;
}

export async function addTranscriptToVoiceMessage({
  chatId,
  messageId,
  transcript,
}: {
  chatId: string;
  messageId: string;
  transcript: string;
}) {
  return bot.updateMessageCaption({
    chatId,
    messageId,
    caption: transcript,
  });
}

// send a voice note (OGG/OPUS)
export async function sendVoiceToChat(
  filepath: string,
  options: { chatIds: string[] },
) {
  console.log("Telegram: sendvoice");
  const { filepath: outVoicePath } = await getTmpOggAudioFile({ filepath });
  console.log("Telegram: sending", outVoicePath);

  const chatIds = options.chatIds;
  const remappedChatIds = new Map<string, string>();
  const chatIdToMessageIdMap = new Map<string, string>();

  async function addMessageToChat({
    chatId,
    migratedFromChatId,
  }: {
    chatId: string;
    migratedFromChatId?: string;
  }): Promise<unknown> {
    const resp = await makeVoiceRequest({ chatId, outVoicePath });
    const parsed = TelegramSendVoiceResponseSchema.safeParse(resp);
    const parsedMigrated =
      TelegramVoiceJsonResponseMigrateToChatSchema.safeParse(resp);
    if (parsed.success) {
      if (migratedFromChatId) {
        remappedChatIds.set(migratedFromChatId, chatId);
      }
      chatIdToMessageIdMap.set(chatId, String(parsed.data.result.message_id));
      return parsed.data;
    } else if (parsedMigrated.success) {
      const newChatId = String(
        parsedMigrated.data.parameters.migrate_to_chat_id,
      );
      const newResp = await addMessageToChat({
        chatId: newChatId,
      });
      return newResp;
    }
  }

  const responses = await Promise.all(
    chatIds?.map(async (chatId) => {
      const resp = await addMessageToChat({ chatId });
      return resp;
    }),
  );

  return { responses, remappedChatIds, chatIdToMessageIdMap };
}

// send an audio file (MP3)
export async function sendAudio(filePath: string, chatId: string) {
  const form = new FormData();

  if (!chatId) {
    throw new Error(`Missing Telegram chatId`);
  }
  form.append("chat_id", chatId);
  form.append("audio", fs.createReadStream(filePath));

  const resp = await bot.sendAudio({ body: form });
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
  const resp = await bot.sendMessage({
    text,
    chatId,
    replyToMessageId,
  });

  const data = await resp.json();
  return { data };
}
