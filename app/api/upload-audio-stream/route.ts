import path from "path";
import { mkdirSync } from "fs";
import { verifyAuth } from "@/lib/auth";
import { spawn } from "child_process";
import fs from "fs";

export const runtime = "nodejs";

const BYTES_PER_SAMPLE = 2; // 16-bit
const MIN_SECONDS = 1;

export async function POST(req: Request) {
  try {
    const errRsp = await verifyAuth(req, {
      tag: "upload-audio-stream",
      method: "POST",
    });
    if (errRsp) return errRsp;

    const recordingId = req.headers.get("x-recording-id");
    const sampleRate = req.headers.get("x-sample-rate") ?? "44100";

    const minBytes = parseInt(sampleRate) * BYTES_PER_SAMPLE * MIN_SECONDS;

    if (!recordingId)
      return new Response("Missing recording ID", { status: 400 });

    console.log(`Recording started: ${recordingId}`);

    const uploadsDir = path.join(process.cwd(), "uploads");
    mkdirSync(uploadsDir, { recursive: true });
    const outputMp3Path = path.join(uploadsDir, `${recordingId}.mp3`);

    return await new Promise<Response>((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-f", // input format is:
        "s16le", // ... 16-bit signed little endian PCM audio
        "-ar", // audio sample rate
        sampleRate, // ... pass from header or default to 44100 Hz
        "-ac", // number of audio channels
        "1", // ... mono input
        "-i", // input filename/stream
        "pipe:0", // ... stdin (we will pipe the audio stream in)
        "-af", // apply audio filters:
        // compand: dynamic range compression, loudnorm: normalize loudness
        "compand=attacks=0.3:decays=0.8:points=-80/-900|-40/-20|-20/-6|0/0:soft-knee=6:gain=8:volume=0,loudnorm=I=-16:TP=-1.5:LRA=11",
        "-acodec", // set audio codec to:
        "libmp3lame", // ... LAME MP3 encoder
        "-ab", // set audio bitrate
        "128k", // ... 128 kbps
        "-y", // overwrite output file without asking
        outputMp3Path, // output file path
      ]);

      let ffmpegErr = "";
      ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));

      let bytesReceived = 0;

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          if (bytesReceived < minBytes) {
            console.log(
              `Recording too short (${bytesReceived} bytes), discarding`,
            );
            fs.unlinkSync(outputMp3Path);
            resolve(Response.json({ ok: true, discarded: true }));
          } else {
            console.log(`Recording saved: ${outputMp3Path}`);
            resolve(Response.json({ ok: true }));
          }
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
            bytesReceived += value.byteLength; // ← count bytes as they arrive
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
