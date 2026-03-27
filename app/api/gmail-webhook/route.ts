import { fetchMessages } from "@/lib/gmail";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import {
  enforcePayloadBudget,
  filterUspsMessages,
  parseStringifiedUspsMessages,
  parseUspsMessage,
} from "@/lib/usps-digest";
import { extractAuthToken } from "@/lib/utils";
import jwt from "jsonwebtoken";

const MAX_RESPONSE_BYTES = 100 * 1024;

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  console.log("google token:", authHeader);
  const token = extractAuthToken(authHeader);
  if (!token) {
    return new Response("Missing token", { status: 401 });
  }
  const decoded = jwt.decode(token);
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
  const authHeader = req.headers.get("authorization");
  const token = extractAuthToken(authHeader);
  if (!token) {
    return new Response("Missing token", { status: 401 });
  }

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

  const parsed = parseStringifiedUspsMessages(latestUsps);

  const digest = parsed?.digest;

  const mappedDigest = digest && {
    ...digest,
    mailpieceImages: digest.mailpieceImages?.map((img) => {
      return {
        ...img,
        base64Data: null,
        dataUrl:
          img.base64Data && img.mimeType
            ? `data:${img.mimeType};base64,${img.base64Data}`
            : null,
      };
    }),
  };

  const boundedDigest = enforcePayloadBudget({
    digest: mappedDigest,
    maxSizeInBytes: MAX_RESPONSE_BYTES,
  });

  return Response.json({
    informedDelivery: {
      ...parsed,
      digest: boundedDigest ?? {},
    },
  });
}
