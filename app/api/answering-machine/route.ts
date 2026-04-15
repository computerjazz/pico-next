import { verifyAuth } from "@/lib/auth";
import { getLatestInboundAudioFilePath } from "./utils";

export async function GET(req: Request) {
  try {
    const maybeResp = await verifyAuth(req, {
      tag: "answering-machine/mp3",
    });
    if (maybeResp) return maybeResp;
    const file = getLatestInboundAudioFilePath();

    return Response.json(file, {
      status: 200,
    });
  } catch (err) {
    console.log("answering-machine", err);
    return new Response(null, { status: 404 });
  }
}
