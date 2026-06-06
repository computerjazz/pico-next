import { verifyAuth } from "@/lib/auth";

type RouteParams = { id: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  try {
    const errRsp = await verifyAuth(req, {
      tag: "device/:id/logs",
      method: "POST",
    });
    if (errRsp) return errRsp;

    const deviceId = (await params).id;
    const body = await req.text();
    console.log(`device logs [${deviceId}]:`, body);

    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("Logs failed", { status: 500 });
  }
}
