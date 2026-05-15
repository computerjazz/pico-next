import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import { getAnsweringMachineFilepath } from "@/app/api/device/[id]/answering-machine/utils";
import { z } from "zod";
import { convertAudioToMp3, getTmpOggAudioFile } from "./audio";

const FilePathSchema = z.object({
  result: z.object({
    file_path: z.string(),
  }),
});

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

  async function getFilePath({ fileId }: { fileId: string }) {
    const fileUrl = `${baseUrl}/getFile?file_id=${fileId}`;
    const getFileRes = await fetch(fileUrl);
    const fileDataJson = await getFileRes.json();
    const parsed = FilePathSchema.safeParse(fileDataJson);
    const filePath = parsed.data?.result.file_path;
    return filePath || "";
  }

  async function getFile({ filepath }: { filepath: string }) {
    const oggRes = await fetch(`${baseUrl}/${filepath}`);
    const arrayBuffer = await oggRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer;
  }

  return {
    sendVoice,
    sendAudio,
    sendMessage,
    updateMessageCaption,
    getFilePath,
    getFile,
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

export async function downloadAndConvertVoice({
  fileId,
  deviceId,
}: {
  fileId: string;
  deviceId: string;
}) {
  console.log("downloading voice");
  const filepath = await bot.getFilePath({ fileId });
  const buffer = await bot.getFile({ filepath });

  const inputOggPath = getAnsweringMachineFilepath({
    fileId,
    ext: "ogg",
    deviceId,
  });

  fs.writeFileSync(inputOggPath, buffer);
  console.log("wrote ogg file", inputOggPath);
  const outputMp3Path = getAnsweringMachineFilepath({
    fileId,
    ext: "mp3",
    deviceId,
  });

  await convertAudioToMp3({
    inputFilepath: inputOggPath,
    outputFilepath: outputMp3Path,
  });

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
