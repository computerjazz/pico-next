import { verifyAuth } from "@/lib/auth";
import { getLatestInboundAudioFilePath } from "./utils";

export async function GET(req: Request) {
  try {
    const maybeResp = await verifyAuth(req, {
      tag: "answering-machine/mp3",
    });
    if (maybeResp) return maybeResp;
    const deviceId = req.headers.get("x-device-id") ?? "unknown";
    const file = await getLatestInboundAudioFilePath({ deviceId });
    if (!file) {
      throw new Error("no answering machine file found");
    }
    return Response.json(file, {
      status: 200,
    });
  } catch (err) {
    console.log("answering-machine", err);
    return new Response(null, { status: 404 });
  }
}
