import { verifyAuth } from "@/lib/auth";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { eq } from "drizzle-orm";
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

    const deviceType = req.headers.get("x-device-type");

    const deviceId = (await params).id;

    // The previous code is not a full upsert: .onConflictDoNothing() just skips insertion if the deviceId exists, so new values are ignored for existing devices.
    // To upsert (insert or update on conflict), use `.onConflictDoUpdate({ target, set })`:
    if (deviceType) {
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
            ...(deviceType ? { type: deviceType } : {}),
          },
        });
    } else {
      await db
        .update(devices)
        .set({
          lastSeenAt: new Date(),
        })
        .where(eq(devices.deviceId, deviceId));
    }

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
