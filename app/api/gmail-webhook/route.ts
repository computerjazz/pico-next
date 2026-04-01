import { verifyAuth } from "@/lib/auth";
import { fetchMessages, validateGoogleToken } from "@/lib/gmail";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import {
  enforcePayloadBudget,
  extractSenderText,
  filterUspsMessages,
  parseStringifiedUspsMessages,
  parseUspsMessage,
} from "@/lib/usps-digest";

const MAX_RESPONSE_BYTES = 100 * 1024;

export async function POST(req: Request) {
  const errRsp = await verifyAuth(req, {
    tag: "gmail-webhook",
    method: "POST",
    validateToken: (token: string) => validateGoogleToken({ token }),
  });

  console.log("gmail-webhook: verifyAuth err?", !!errRsp);

  if (errRsp) {
    return errRsp;
  }

  const body = await req.json();
  try {
    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString(),
    );
    const historyId = decoded.historyId;
    console.log("getting history", historyId);
    const { messages } = await fetchMessages({ historyId });
    console.log("got messages", messages);
    const uspsMessages = await Promise.all(
      filterUspsMessages({ messages }).messages.map((m) =>
        parseUspsMessage({ message: m }),
      ),
    );
    console.log("usps messages", uspsMessages);

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

    console.log("gmail-webhook: return 204");

    // Here you could save images, trigger your frontend, etc.
    return new Response(null, { status: 204 });
  } catch {
    console.log("gmail-webhook: return 500");
    return new Response(null, { status: 500 });
  }
}

export async function GET(req: Request) {
  const errRsp = await verifyAuth(req, { tag: "gmail-webhook", method: "GET" });
  if (errRsp) return errRsp;
  const redis = await getRedis();
  const [latestUsps] = await Promise.all([
    redis.get(REDIS_KEYS.LATEST_USPS_EMAILS),
    redis.get(REDIS_KEYS.LATEST_GMAIL_HISTORY_ID),
    redis.get(REDIS_KEYS.LATEST_EMAIL_RAW),
    redis.get(REDIS_KEYS.EMAIL_WEBHOOK_COUNT),
  ]);

  const parsed = parseStringifiedUspsMessages(latestUsps);

  const digest = parsed?.digest;

  const mappedDigest = digest && {
    ...digest,
    mailpieceImages: await Promise.all(
      digest.mailpieceImages?.map(async (img) => {
        // extract OCR text _before_ shrinking images
        const ocrText = await extractSenderText(img.base64Data);
        return {
          ...img,
          ocrText,
        };
      }) ?? [],
    ),
  };

  const boundedDigest = await enforcePayloadBudget({
    digest: mappedDigest,
    maxSizeInBytes: MAX_RESPONSE_BYTES,
  });

  const dataUrlDigest = boundedDigest && {
    ...boundedDigest,
    mailpieceImages: await Promise.all(
      boundedDigest.mailpieceImages?.map(async (img) => {
        const dataUrl =
          img.base64Data && img.mimeType
            ? `data:${img.mimeType};base64,${img.base64Data}`
            : null;
        return {
          ...img,
          base64Data: null,
          dataUrl,
        };
      }) ?? [],
    ),
  };

  return Response.json({
    informedDelivery: {
      ...parsed,
      digest: dataUrlDigest ?? {},
    },
  });
}
