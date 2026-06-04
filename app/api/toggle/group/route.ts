import { db } from "@/db";
import { getGroupScore } from "@/lib/toggle-score";

export async function GET(req: Request) {
  const deviceId = req.headers.get("x-device-id") ?? "unknown";
  const group = await db.query.deviceGroups.findFirst({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
  });
  const groupId = group?.groupId;
  if (!groupId) {
    return Response.json({ error: "missing group id" }, { status: 400 });
  }
  const score = await getGroupScore(groupId);
  return Response.json(score, { status: 200 });
}
