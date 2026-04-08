import { verifyAuth } from "@/lib/auth";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import { downloadAndConvertVoice, getFilePath } from "@/lib/telegram";
import z from "zod";
import fs from "fs";

const TelegramVoiceMessageSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      language_code: z.string(),
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const redis = await getRedis();
    console.log("telegram-webhook body", body);
    await redis.set(REDIS_KEYS.LATEST_TELEGRAM_MESSAGE, JSON.stringify(body));
    console.log("telegram-webhook: set latest telegram message");
    const parsed = TelegramVoiceMessageSchema.safeParse(JSON.parse(body ?? {}));
    console.log("telegram-webhook: parsed", parsed);
    if (parsed.success) {
      const { voice } = parsed.data.message;
      console.log("successfully parsed telegram voice message", voice);
      const voiceMp3 = await downloadAndConvertVoice(voice.file_id);
      console.log("voiceMp3", voiceMp3);
    }
    // Here you could save images, trigger your frontend, etc.
    return new Response(null, { status: 200 });
  } catch (err) {
    console.log("telegram-webhook POST: return 500", err);
    return new Response(null, { status: 500 });
  }
}

export async function GET(req: Request) {
  const errRsp = await verifyAuth(req, {
    tag: "telegram-webhook",
    method: "GET",
  });
  if (errRsp) return errRsp;
  console.log("GET telegram-webhook");
  const redis = await getRedis();
  const latestTelegramMessage = await redis.get(
    REDIS_KEYS.LATEST_TELEGRAM_MESSAGE,
  );

  let latestVoiceMessagePath = "";

  const parsed = TelegramVoiceMessageSchema.safeParse(
    JSON.parse(latestTelegramMessage ?? "{}"),
  );
  console.log("parsed:", parsed);
  if (parsed.success) {
    const fileId = parsed.data.message.voice.file_id;
    latestVoiceMessagePath = getFilePath(fileId); // Check whether file already exists
    const fileExists = fs.existsSync(latestVoiceMessagePath);
    console.log("file exists:", fileExists);
    if (!fileExists)
      latestVoiceMessagePath = await downloadAndConvertVoice(fileId);
  }

  return Response.json({
    latestTelegramMessage,
    latestVoiceMessagePath,
  });
}
