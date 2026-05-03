import { db } from "@/db";
import { verifyAuth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import z from "zod";

type RouteParams = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  try {
    const maybeErr = await verifyAuth(req, { method: "GET", tag: "shortwave" });
    const deviceId = (await params).id;
    if (maybeErr) return maybeErr;
    const device = await db.query.devices.findFirst({
      where: (t, { eq }) => eq(t.deviceId, deviceId),
    });
    return new Response(JSON.stringify({ ...device }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

const ShortwaveDevicePostBodySchema = z.object({
  volume: z.number().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const [maybeErr, { id: deviceId }, reqJson, redis] = await Promise.all([
    verifyAuth(req, { method: "POST", tag: "toggle" }),
    params,
    req.json(),
    getRedis(),
  ]);

  if (maybeErr) return maybeErr;

  const parsed = ShortwaveDevicePostBodySchema.safeParse(reqJson);
  if (!parsed.success) {
    console.log("bad shortwave post request!");
    return Response.json({ error: "malformed body" }, { status: 400 });
  }

  const { volume } = parsed.data;

  if (volume !== undefined) {
    await redis.publish(
      "ws:commands",
      JSON.stringify({
        targetId: deviceId,
        command: JSON.stringify({
          type: "shortwave_config",
          volume: String(volume),
        }),
      }),
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
