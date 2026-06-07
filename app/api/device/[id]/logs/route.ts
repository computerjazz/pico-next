import { verifyAuth } from "@/lib/auth";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

type RouteParams = { id: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  try {
    const errRsp = await verifyAuth(req, {
      tag: "device/:id/logs",
      method: "POST",
    });
    if (errRsp) return errRsp;

    const deviceId = (await params).id;
    const redis = await getRedis();
    const key = `${REDIS_KEYS.DEVICE_LOGS_PREFIX}-${deviceId}`;
    const cur = (await redis.get(key)) || "";

    const body = await req.text();
    console.log(`device logs [${deviceId}]:`, body);
    await redis.set(
      key,
      `${cur} \n\n ${new Date().toLocaleTimeString()} \n\n ${body}`,
    );

    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("Logs failed", { status: 500 });
  }
}
