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

    await db
      .insert(devices)
      .values({
        deviceId,
        type: deviceType,
      })
      .onConflictDoNothing();

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
