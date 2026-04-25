import { verifyAuth } from "@/lib/auth";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import {
  downloadAndConvertVoice,
  getFilePath,
  sendMessageToChat,
} from "@/lib/telegram";
import z from "zod";
import fs from "fs";
import { db } from "@/db";
import { deviceChannels } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const CHANNEL_TYPE_TELEGRAM = "telegram";

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

type TelegramVoiceMessage = z.infer<typeof TelegramVoiceMessageSchema>;

const TelegramTextMessageSchema = z.object({
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
    text: z.string(),
    entities: z.array(z.unknown()),
  }),
});

type TelegramTextMessage = z.infer<typeof TelegramTextMessageSchema>;

async function onVoiceMessageReceived({
  message,
}: {
  message: TelegramVoiceMessage["message"];
}) {
  const { voice, chat } = message;
  console.log("successfully parsed telegram voice message", voice, chat);

  const chatId = chat.id;

  const devices = await db.query.deviceChannels.findMany({
    where: (t, { eq }) => eq(t.channelId, String(chatId)),
  });

  await Promise.all(
    devices.map(async (device) => {
      const voiceMp3 = await downloadAndConvertVoice({
        fileId: voice.file_id,
        deviceId: device.deviceId,
      });
      console.log("voiceMp3", voiceMp3);
    }),
  );
}

async function addDeviceToChannel({
  deviceId,
  channelId,
}: {
  deviceId: string;
  channelId: string;
}) {
  console.log(`adding device to channel with device id: ${deviceId}`);
  if (!deviceId) {
    console.error("/add called with no device id");
    return {
      success: false,
      message: "/add must be followed by a device id",
    };
  }
  const device = await db.query.devices.findFirst({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
  });

  if (!device) {
    console.error(`no device found with id: ${deviceId}`);
    return {
      success: false,
      message: `No device found with id ${deviceId}`,
    };
  }
  const existingEntry = await db.query.deviceChannels.findFirst({
    where: (t, { eq, and }) =>
      and(
        eq(t.channelId, channelId),
        eq(t.deviceId, deviceId),
        eq(t.type, CHANNEL_TYPE_TELEGRAM),
      ),
  });

  if (existingEntry) {
    console.log(`device already added to channel ${deviceId}`);
    return {
      success: false,
      message: `${deviceId} is already in this chat!`,
    };
  }

  await db.insert(deviceChannels).values({
    deviceId,
    type: CHANNEL_TYPE_TELEGRAM,
    channelId,
  });
  return { success: true, message: `Added ${deviceId} to this chat!` };
}

async function removeDeviceFromChannel({
  deviceId,
  channelId,
}: {
  deviceId: string;
  channelId: string;
}) {
  console.log(`removing device from channel with device id: ${deviceId}`);
  if (!deviceId) {
    console.error("/remove called with no device id");
    return {
      success: false,
      message: "/remove must be followed by a device id",
    };
  }
  const device = await db.query.devices.findFirst({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
  });

  if (!device) {
    console.error(`no device found with id: ${deviceId}`);
    return {
      success: false,
      message: `No device found with id ${deviceId}`,
    };
  }

  await db
    .delete(deviceChannels)
    .where(
      and(
        eq(deviceChannels.deviceId, deviceId),
        eq(deviceChannels.type, CHANNEL_TYPE_TELEGRAM),
        eq(deviceChannels.channelId, channelId),
      ),
    );
  return { success: true, message: `Removed ${deviceId} from this chat!` };
}

async function onTextMessageReceived({
  message,
}: {
  message: TelegramTextMessage["message"];
}) {
  const [command, ...args] = message.text.split(" ");
  const channelId = String(message.chat.id);
  const messageId = String(message.message_id);

  if (command === "/add") {
    const deviceId = args[0];
    const status = await addDeviceToChannel({ deviceId, channelId });
    await sendMessageToChat({
      chatId: channelId,
      text: status.message,
      replyToMessageId: messageId,
    });
  }

  if (command === "/remove") {
    const deviceId = args[0];
    const status = await removeDeviceFromChannel({ deviceId, channelId });
    await sendMessageToChat({
      chatId: channelId,
      text: status.message,
      replyToMessageId: messageId,
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const redis = await getRedis();
    console.log("telegram-webhook body", body);
    await redis.set(REDIS_KEYS.LATEST_TELEGRAM_MESSAGE, JSON.stringify(body));
    console.log("telegram-webhook: set latest telegram message");
    const voiceMessageParsed = TelegramVoiceMessageSchema.safeParse(body);
    const textMessageParsed = TelegramTextMessageSchema.safeParse(body);
    console.log("telegram-webhook: parsed", voiceMessageParsed);

    if (voiceMessageParsed.success) {
      await onVoiceMessageReceived({
        message: voiceMessageParsed.data.message,
      });
    }

    if (textMessageParsed.success) {
      await onTextMessageReceived({
        message: textMessageParsed.data.message,
      });
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
  const deviceId = req.headers.get("x-device-id") ?? "unknown";
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
    latestVoiceMessagePath = getFilePath({
      fileId,
      deviceId,
    }); // Check whether file already exists
    const fileExists = fs.existsSync(latestVoiceMessagePath);
    console.log("file exists:", fileExists);
    if (!fileExists)
      latestVoiceMessagePath = await downloadAndConvertVoice({
        fileId,
        deviceId,
      });
  }

  return Response.json({
    latestTelegramMessage,
    latestVoiceMessagePath,
  });
}
