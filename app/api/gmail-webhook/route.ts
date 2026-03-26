import { fetchMessages } from "@/lib/gmail";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import {
  filterUspsMessages,
  parseStringifiedUspsMessages,
  parseUspsMessage,
} from "@/lib/usps-digest";
import jwt from "jsonwebtoken";

const MAX_RESPONSE_BYTES = 100 * 1024;

function getJsonSizeBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function enforcePayloadBudget(payload: {
  informedDelivery: Record<string, unknown>;
}) {
  if (getJsonSizeBytes(payload) <= MAX_RESPONSE_BYTES) return payload;

  const informedDelivery = {
    ...payload.informedDelivery,
  } as Record<string, unknown>;
  const rawImages = informedDelivery.mailpieceImages;
  if (!Array.isArray(rawImages)) {
    return payload;
  }

  const images = rawImages.map((img) => ({ ...(img as Record<string, unknown>) }));
  informedDelivery.mailpieceImages = images;

  const imageIndexesByBase64Size = images
    .map((img, index) => ({
      index,
      size:
        typeof img.base64Data === "string"
          ? Buffer.byteLength(img.base64Data, "utf8")
          : 0,
    }))
    .sort((a, b) => b.size - a.size);

  let candidate = { informedDelivery };
  for (const { index } of imageIndexesByBase64Size) {
    if (getJsonSizeBytes(candidate) <= MAX_RESPONSE_BYTES) break;
    images[index] = {
      ...images[index],
      base64Data: null,
      dataUrl: null,
    };
    candidate = { informedDelivery };
  }

  // Last resort: clear all thumbnails if still over budget.
  if (getJsonSizeBytes(candidate) > MAX_RESPONSE_BYTES) {
    informedDelivery.mailpieceImages = images.map((img) => ({
      ...img,
      base64Data: null,
      dataUrl: null,
    }));
    candidate = { informedDelivery };
  }

  return candidate;
}

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString(),
    );
    const historyId = decoded.historyId;
    const { messages } = await fetchMessages({ historyId });
    const uspsMessages = await Promise.all(
      filterUspsMessages({ messages }).messages.map((m) =>
        parseUspsMessage({ message: m }),
      ),
    );

    const redis = await getRedis();
    if (uspsMessages.length) {
      await redis.set(
        REDIS_KEYS.LATEST_USPS_EMAILS,
        JSON.stringify(uspsMessages),
      );
    }
    if (messages.length) {
      await Promise.all([
        redis.set(REDIS_KEYS.LATEST_GMAIL_HISTORY_ID, historyId),
        redis.incr(REDIS_KEYS.EMAIL_WEBHOOK_COUNT),
        redis.set(REDIS_KEYS.LATEST_EMAIL_RAW, JSON.stringify(messages)),
      ]);
    }

    // Here you could save images, trigger your frontend, etc.
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const authPrefix = "Bearer ";
  if (!auth?.startsWith(authPrefix)) {
    return new Response("Missing token", { status: 401 });
  }

  const token = auth.slice(authPrefix.length);

  try {
    jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return new Response("Invalid token", { status: 403 });
  }
  const redis = await getRedis();
  const [latestUsps] = await Promise.all([
    redis.get(REDIS_KEYS.LATEST_USPS_EMAILS),
    redis.get(REDIS_KEYS.LATEST_GMAIL_HISTORY_ID),
    redis.get(REDIS_KEYS.LATEST_EMAIL_RAW),
    redis.get(REDIS_KEYS.EMAIL_WEBHOOK_COUNT),
  ]);

  // if (_historyId) {
  //   const { messages } = await fetchMessages({ historyId: _historyId });
  //   const uspsMessages = await Promise.all(
  //     filterUspsMessages({ messages }).messages.map((m) =>
  //       parseUspsMessage({ message: m }),
  //     ),
  //   );
  //   const testMsg = uspsMessages[0];
  //   console.log("test", testMsg);
  //   const tstResp = parseStringifiedUspsMessages(JSON.stringify(uspsMessages));
  //   console.log("tstREsp!!", tstResp);
  // }

  const payload = {
    informedDelivery: parseStringifiedUspsMessages(latestUsps),
  };

  const boundedPayload = enforcePayloadBudget({
    informedDelivery: payload.informedDelivery as Record<string, unknown>,
  });

  return Response.json(boundedPayload);
}
