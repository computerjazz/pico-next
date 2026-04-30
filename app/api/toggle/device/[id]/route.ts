import { db } from "@/db";
import { devices, toggles } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { getGroupScore } from "@/lib/toggle-score";
import z from "zod";

type RouteParams = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  try {
    const maybeErr = await verifyAuth(req, { method: "GET", tag: "toggle" });
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

const ToggleStatePostBodySchema = z.object({
  state: z.enum(["on", "off"]),
  groupId: z.string(),
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

  const parsed = ToggleStatePostBodySchema.safeParse(reqJson);
  if (!parsed.success) {
    console.log("bad toggle state request!");
    return Response.json({ error: "malformed body" }, { status: 400 });
  }

  const { state, groupId } = parsed.data;

  // make sure device exists, add it if needed
  const insertPromise = db
    .insert(devices)
    .values({
      deviceId,
      type: "toggle",
    })
    .onConflictDoNothing();

  const togglePromise = db.insert(toggles).values({
    state,
    groupId,
    deviceId,
  });

  await Promise.all([insertPromise, togglePromise]);

  const score = await getGroupScore(groupId);

  await Promise.all(
    score.devices.map(async (device) => {
      return redis.publish(
        "ws:commands",
        JSON.stringify({
          targetId: device.deviceId,
          command: JSON.stringify({
            type: "toggle_state",
            groupId,
            phase: score.phase,
            activeDeviceId: score.activeDeviceId,
            asOf: score.asOf,
            devices: score.devices,
          }),
        }),
      );
    }),
  );

  return Response.json({ success: true, score }, { status: 200 });
}
