import { getGroupScore } from "@/lib/toggle-score";

type RouteParams = { id: string };

export async function GET(
  _req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const groupId = (await params).id;
  if (!groupId) {
    return Response.json({ error: "missing group id" }, { status: 400 });
  }
  const score = await getGroupScore({ groupId });
  return Response.json(score, { status: 200 });
}
