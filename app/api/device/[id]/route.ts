import { db } from "@/db";
import { verifyAuth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { onShortwaveDevicePost, onToggleDevicePost } from "./utils";

type RouteParams = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  try {
    const maybeErr = await verifyAuth(req, {
      method: "GET",
      tag: "device/:id",
    });
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

export async function POST(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const [maybeErr, { id: deviceId }, jsonBody] = await Promise.all([
    verifyAuth(req, { method: "POST", tag: "toggle" }),
    params,
    req.json(),
    getRedis(),
  ]);

  if (maybeErr) return maybeErr;

  const device = await db.query.devices.findFirst({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
  });

  switch (device?.type) {
    case "shortwave": {
      const resp = await onShortwaveDevicePost({ deviceId, json: jsonBody });
      if (resp.error) {
        return Response.json(
          { success: false, error: resp.error },
          { status: 400 },
        );
      }

      break;
    }
    case "toggle": {
      const resp = await onToggleDevicePost({ deviceId, json: jsonBody });
      if (resp.error) {
        return Response.json(
          { success: false, error: resp.error },
          { status: 400 },
        );
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ success: true }, { status: 200 });
}
