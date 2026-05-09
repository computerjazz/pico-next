import { verifyAuth } from "@/lib/auth";
import { db } from "@/db";
import { devices } from "@/db/schema";
type RouteParams = { id: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  try {
    const errRsp = await verifyAuth(req, {
      tag: "phone-home",
      method: "POST",
    });
    if (errRsp) return errRsp;

    const deviceType = req.headers.get("x-device-type") ?? "unknown";

    const deviceId = (await params).id;

    // The previous code is not a full upsert: .onConflictDoNothing() just skips insertion if the deviceId exists, so new values are ignored for existing devices.
    // To upsert (insert or update on conflict), use `.onConflictDoUpdate({ target, set })`:
    await db
      .insert(devices)
      .values({
        deviceId,
        type: deviceType,
      })
      .onConflictDoUpdate({
        target: devices.deviceId,
        set: {
          lastSeenAt: new Date(),
        },
      });
    // This does an actual upsert: if deviceId exists, it will update the `type`; if not, it will insert a new device.

    console.log("phone home from: ", deviceId, deviceType);

    const device = await db.query.devices.findFirst({
      where: (t, { eq }) => eq(t.deviceId, deviceId),
    });
    return Response.json({ success: true, device }, { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("Phone home failed", { status: 500 });
  }
}
