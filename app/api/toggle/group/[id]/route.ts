import { db } from "@/db";
import { verifyAuth } from "@/lib/auth";

type RouteParams = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const maybeErr = await verifyAuth(req, { method: "POST", tag: "toggle" });
  if (maybeErr) return maybeErr;
  const groupId = (await params).id;
  const group = await db.query.toggles.findMany({
    where: (t, { eq }) => eq(t.groupId, groupId),
  });

  return Response.json({ group }, { status: 200 });
}
