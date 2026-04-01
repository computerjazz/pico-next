import { verifyAuth } from "@/lib/auth";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const redis = await getRedis();
    console.log("telegram-webhook body", body);
    await redis.set(REDIS_KEYS.LATEST_TELEGRAM_MESSAGE, JSON.stringify(body));

    // Here you could save images, trigger your frontend, etc.
    return new Response(null, { status: 204 });
  } catch {
    console.log("telegram-webhook: return 500");
    return new Response(null, { status: 500 });
  }
}

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
  return Response.json({
    latestTelegramMessage,
  });
}
