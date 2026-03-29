import { spawn } from "child_process";
import { Readable } from "stream";
import { type ReadableStream } from "stream/web";
import path from "path";
import { mkdirSync } from "fs";
import { verifyAuth } from "@/lib/auth";

export const runtime = "nodejs"; // ensures this doesn't run in edge

export async function POST(req: Request) {
  try {
    const errRsp = await verifyAuth(req, {
      tag: "upload-audio-stream ",
      method: "POST",
    });
    if (errRsp) return errRsp;

    // convert web stream → node stream
    const nodeStream = Readable.fromWeb(req.body as ReadableStream<unknown>);

    const filename = `msg-${Date.now()}.mp3`;
    const uploadsDir = path.join(process.cwd(), "uploads");
    mkdirSync(uploadsDir, { recursive: true });

    const outputPath = path.join(uploadsDir, filename);

    const ffmpeg = spawn("ffmpeg", [
      "-f",
      "wav", // incoming format
      "-i",
      "pipe:0", // read from stdin
      "-acodec",
      "libmp3lame",
      "-ab",
      "128k",
      outputPath,
    ]);

    nodeStream.pipe(ffmpeg.stdin);

    await new Promise((resolve, reject) => {
      ffmpeg.on("close", resolve);
      ffmpeg.on("error", reject);
    });

    return Response.json({
      ok: true,
      file: filename,
    });
  } catch (err) {
    console.error(err);
    return new Response("Upload failed", { status: 500 });
  }
}
