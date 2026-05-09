import path from "path";
import { mkdirSync } from "fs";
import { verifyAuth } from "@/lib/auth";
import { spawn } from "child_process";
import fs from "fs";
import { sendVoiceToChat } from "@/lib/telegram";
import { db } from "@/db";
import { deviceChannels, recordings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { CHANNEL_TYPE } from "@/lib/constants";
import { getAudioDuration } from "@/lib/utils";

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

    const recordingId =
      req.headers.get("x-recording-id") ?? `new-recording-${Date.now()}`;
    const sampleRate = req.headers.get("x-sample-rate") ?? "44100";
    const deviceId = req.headers.get("x-device-id") ?? "unknown";
    const audioFilename = `${deviceId}-${new Date().toISOString()}-${recordingId}.mp3`;

    console.log(`Recording started: ${recordingId}`);

    const ffmpegResult = await new Promise<{
      errorMsg?: string;
      outputMp3Path?: string;
    }>((resolve) => {
      const minBytes = parseInt(sampleRate) * BYTES_PER_SAMPLE * MIN_SECONDS;
      const audioDir = path.join(
        process.cwd(),
        "uploads",
        "sh0rtwave",
        deviceId,
        "outbound",
      );
      mkdirSync(audioDir, { recursive: true });
      const outputMp3Path = path.join(audioDir, audioFilename);
      const ffmpeg = spawn("ffmpeg", [
        "-f", // input format is:
        "s16le", // ... 16-bit signed little endian PCM audio
        "-ar", // audio sample rate
        sampleRate, // ... pass from header or default to 44100 Hz
        "-ac", // number of audio channels
        "1", // ... mono input
        "-i", // input filename/stream
        "pipe:0", // ... stdin (we will pipe the audio stream in)
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
            const errMsg = `Recording too short (${bytesReceived} bytes), discarding`;
            console.log(errMsg);
            fs.unlinkSync(outputMp3Path);
            resolve({ errorMsg: errMsg });
          } else {
            console.log(`Recording saved: ${outputMp3Path}`);
            resolve({ outputMp3Path });
          }
        } else {
          const errMsg = `ffmpegErr: ${ffmpegErr}`;
          console.error(errMsg);
          resolve({ errorMsg: errMsg });
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

    try {
      const { outputMp3Path, errorMsg } = await ffmpegResult;
      if (!outputMp3Path) {
        return Response.json({
          ok: false,
          error: errorMsg || "No mp3 output",
        });
      }
      console.log("sending as voice ", outputMp3Path);
      const channels = await db.query.deviceChannels.findMany({
        where: (t, { eq, and }) =>
          and(
            eq(t.deviceId, deviceId ?? ""),
            eq(t.type, CHANNEL_TYPE.TELEGRAM),
          ),
        columns: { channelId: true },
      });

      const { durationMillis } = await getAudioDuration({
        filepath: outputMp3Path,
      });

      await db.insert(recordings).values({
        deviceId,
        filepath: outputMp3Path,
        contentType: "audio/mpeg",
        name: audioFilename,
        source: "shortwave-device",
        durationMillis: String(durationMillis),
      });

      const chatIds = channels.map((c) => c.channelId);
      const resp = await sendVoiceToChat(outputMp3Path, {
        fadeOutDurationSec: 0.25,
        chatIds,
      });
      console.log("voice resp", resp);
      const { remappedChatIds } = resp;
      if (remappedChatIds.size) {
        await Promise.all(
          [...remappedChatIds].map(async ([oldChatId, newChatId]) => {
            await db
              .update(deviceChannels)
              .set({
                channelId: newChatId,
              })
              .where(
                and(
                  eq(deviceChannels.deviceId, deviceId),
                  eq(deviceChannels.channelId, oldChatId),
                  eq(deviceChannels.type, "telegram"),
                ),
              );
          }),
        );
      }
    } catch (err) {
      console.log("Send voice error", err);
    }
    return Response.json(
      {
        ok: true,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(err);
    return new Response("Upload failed", { status: 500 });
  }
}
