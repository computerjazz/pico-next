import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";
import { mkdirSync, appendFileSync, existsSync } from "fs";
import path from "path";
import { verifyAuth } from "@/lib/auth";

export const runtime = "nodejs";

// Track ffmpeg processes by recording ID
const ffmpegProcesses: Record<string, ChildProcessWithoutNullStreams> = {};

export async function POST(req: Request) {
  try {
    const errRsp = await verifyAuth(req, {
      tag: "upload-audio-stream",
      method: "POST",
    });
    if (errRsp) return errRsp;

    const recordingId = req.headers.get("x-recording-id");
    const finalChunk = req.headers.get("x-final-chunk") === "true";

    if (!recordingId)
      return new Response("Missing recording ID", { status: 400 });

    const uploadsDir = path.join(process.cwd(), "uploads");
    mkdirSync(uploadsDir, { recursive: true });

    const tempRawPath = path.join(uploadsDir, `${recordingId}.raw`);
    const outputMp3Path = path.join(uploadsDir, `${recordingId}.mp3`);

    // Convert web stream → node stream
    const nodeStream = Readable.fromWeb(req.body as ReadableStream<unknown>);

    // Ensure temp raw file exists
    if (!existsSync(tempRawPath)) appendFileSync(tempRawPath, Buffer.alloc(0));

    // Start ffmpeg process if not already running
    if (!ffmpegProcesses[recordingId]) {
      const ffmpeg = spawn("ffmpeg", [
        "-f",
        "s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-i",
        tempRawPath, // input raw PCM
        "-acodec",
        "libmp3lame",
        "-ab",
        "128k",
        outputMp3Path,
      ]);

      ffmpeg.stderr.on("data", (data) =>
        console.error(`ffmpeg[${recordingId}]:`, data.toString()),
      );
      ffmpeg.on("close", () => {
        console.log(`Recording ${recordingId} MP3 encoding finished`);
        delete ffmpegProcesses[recordingId];
      });

      ffmpegProcesses[recordingId] = ffmpeg;
      console.log(`Started ffmpeg for recording ${recordingId}`);
    }

    // Append current chunk to raw file
    nodeStream.on("data", (chunk: Buffer) => {
      appendFileSync(tempRawPath, chunk);
    });

    await new Promise((resolve, reject) => {
      nodeStream.on("end", resolve);
      nodeStream.on("error", reject);
    });

    // If final chunk, signal ffmpeg to finalize
    if (finalChunk && ffmpegProcesses[recordingId]) {
      const ffmpeg = ffmpegProcesses[recordingId];
      ffmpeg.stdin?.end(); // close stdin if used
      console.log(`Final chunk received for ${recordingId}`);
    }

    return Response.json({ ok: true, chunkAppended: true });
  } catch (err) {
    console.error(err);
    return new Response("Upload failed", { status: 500 });
  }
}
