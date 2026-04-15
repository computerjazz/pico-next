import fs from "fs";
import { getLatestInboundAudioFilePath } from "../utils";
import { verifyAuth } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const maybeResp = await verifyAuth(req, { tag: "answering-machine/audio" });
    if (maybeResp) return maybeResp;

    const { filePath, contentType } = getLatestInboundAudioFilePath();
    const fileBuffer = fs.readFileSync(filePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileBuffer.length.toString(),
        // Prevent caching so the ESP32 always gets the freshest file
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.log("answering-machine/audio", err);
    return new Response(null, { status: 404 });
  }
}
