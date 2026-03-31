import path from "path";
import { mkdirSync } from "fs";
import { verifyAuth } from "@/lib/auth";
import { spawn } from "child_process";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const errRsp = await verifyAuth(req, {
      tag: "upload-audio-stream",
      method: "POST",
    });
    if (errRsp) return errRsp;

    const recordingId = req.headers.get("x-recording-id");
    if (!recordingId)
      return new Response("Missing recording ID", { status: 400 });

    console.log(`Recording started: ${recordingId}`);

    const uploadsDir = path.join(process.cwd(), "uploads");
    mkdirSync(uploadsDir, { recursive: true });
    const outputMp3Path = path.join(uploadsDir, `${recordingId}.mp3`);

    return await new Promise<Response>((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-f",
        "s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-i",
        "pipe:0", // read raw PCM from stdin
        "-acodec",
        "libmp3lame",
        "-ab",
        "128k",
        "-y",
        outputMp3Path,
      ]);

      let ffmpegErr = "";
      ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          console.log(`Recording saved: ${outputMp3Path}`);
          resolve(Response.json({ ok: true }));
        } else {
          console.error("ffmpeg error:", ffmpegErr);
          resolve(new Response("Encoding failed", { status: 500 }));
        }
      });

      // pipe the request body stream directly into ffmpeg stdin
      const reader = req.body!.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              ffmpeg.stdin.end();
              break;
            }
            ffmpeg.stdin.write(value);
          }
        } catch (err) {
          console.error("Stream error:", err);
          ffmpeg.stdin.end();
        }
      };
      pump();
    });
  } catch (err) {
    console.error(err);
    return new Response("Upload failed", { status: 500 });
  }
}
