import fs from "fs";
import { verifyAuth } from "@/lib/auth";
import { db } from "@/db";
type RouteParams = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  try {
    const maybeResp = await verifyAuth(req, { tag: "answering-machine/audio" });
    if (maybeResp) return maybeResp;
    const recordingId = (await params).id;
    const recording = await db.query.recordings.findFirst({
      where: (t, { eq }) => eq(t.id, recordingId),
    });
    if (!recording) {
      throw new Error("no file found");
    }
    const fileBuffer = fs.readFileSync(recording.filepath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": recording.contentType ?? "",
        "Content-Length": fileBuffer.length.toString(),
        // Prevent caching so the ESP32 always gets the freshest file
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.log("recording", err);
    return new Response(null, { status: 404 });
  }
}
