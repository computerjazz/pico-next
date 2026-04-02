import { verifyAuth } from "@/lib/auth";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import { downloadAndConvertVoice } from "@/lib/telegram";
import z from "zod";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const redis = await getRedis();
    console.log("telegram-webhook body", body);
    await redis.set(REDIS_KEYS.LATEST_TELEGRAM_MESSAGE, JSON.stringify(body));

    // Here you could save images, trigger your frontend, etc.
    return new Response(null, { status: 200 });
  } catch {
    console.log("telegram-webhook: return 500");
    return new Response(null, { status: 500 });
  }
}

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

export async function GET(req: Request) {
  const errRsp = await verifyAuth(req, {
    tag: "telegram-webhook",
    method: "GET",
  });
  if (errRsp) return errRsp;
  console.log("telegram-webhook!");
  const redis = await getRedis();
  const latestTelegramMessage = await redis.get(
    REDIS_KEYS.LATEST_TELEGRAM_MESSAGE,
  );

  let latestVoiceMessagePath = "";

  if (latestTelegramMessage) {
    const parsed = TelegramVoiceMessageSchema.safeParse(
      JSON.parse(latestTelegramMessage ?? {}),
    );
    if (parsed.success) {
      const { voice } = parsed.data.message;
      const voiceMp3 = await downloadAndConvertVoice(
        voice.file_id,
        `telegram-${voice.file_id}`,
      );
      latestVoiceMessagePath = voiceMp3;
      console.log("voiceMp3", voiceMp3);
    }
  }
  return Response.json({
    latestTelegramMessage,
    latestVoiceMessagePath,
  });
}
