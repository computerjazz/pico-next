import { fetchNewUspsEmails } from "@/lib/gmail";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const redis = await getRedis();
    await redis.incr(REDIS_KEYS.EMAIL_WEBHOOK_COUNT);
    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString(),
    );
    await redis.set(REDIS_KEYS.LATEST_EMAIL_RAW, JSON.stringify(decoded));
    const historyId = decoded.historyId;
    const newUspsEmails = await fetchNewUspsEmails(historyId);
    await redis.set(
      REDIS_KEYS.LATEST_USPS_EMAILS,
      JSON.stringify(newUspsEmails),
    );

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
  const latestRaw = await redis.get(REDIS_KEYS.LATEST_EMAIL_RAW);
  const count = await redis.get(REDIS_KEYS.EMAIL_WEBHOOK_COUNT);

  return Response.json({ latestUsps, latestRaw, count });
}
