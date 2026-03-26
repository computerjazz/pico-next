import { fetchMessages } from "@/lib/gmail";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import {
  filterUspsMessages,
  parseStringifiedUspsMessages,
  parseUspsMessage,
} from "@/lib/usps-digest";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString(),
    );
    const historyId = decoded.historyId;
    const { messages } = await fetchMessages({ historyId });
    const uspsMessages = filterUspsMessages({ messages }).messages.map((m) =>
      parseUspsMessage({ message: m }),
    );

    const redis = await getRedis();
    await Promise.all([
      redis.incr(REDIS_KEYS.EMAIL_WEBHOOK_COUNT),
      redis.set(REDIS_KEYS.LATEST_USPS_EMAILS, JSON.stringify(uspsMessages)),
      redis.set(REDIS_KEYS.LATEST_EMAIL_RAW, JSON.stringify(messages)),
    ]);

    // Here you could save images, trigger your frontend, etc.
    return new Response(null, { status: 204 });
  } catch (e) {
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
  const latestUsps = await redis.get(REDIS_KEYS.LATEST_USPS_EMAILS);

  return Response.json({
    informedDelivery: parseStringifiedUspsMessages(latestUsps),
  });
}
