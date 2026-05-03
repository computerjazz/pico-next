import { verifyAuth } from "@/lib/auth";
import { db } from "@/db";
import { devices } from "@/db/schema";

export async function POST(req: Request) {
  try {
    const errRsp = await verifyAuth(req, {
      tag: "phone-home",
      method: "POST",
    });
    if (errRsp) return errRsp;

    const deviceId = req.headers.get("x-device-id") ?? "unknown";
    const deviceType = req.headers.get("x-device-type") ?? "unknown";
    console.log("phone home from: ", deviceId, deviceType);

    await db
      .insert(devices)
      .values({
        deviceId,
        type: deviceType,
      })
      .onConflictDoNothing();

    const device = await db.query.devices.findFirst({
      where: (t, { eq }) => eq(t.deviceId, deviceId),
    });
    return Response.json({ success: true, device }, { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("Phone home failed", { status: 500 });
  }
}
