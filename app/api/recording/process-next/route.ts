import { db } from "@/db";
import { recordings } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { transcribeAudio, processAudio, getAudioDuration } from "@/lib/audio";
import { addTranscriptToVoiceMessage } from "@/lib/telegram";
import { randomUUID } from "crypto";
import { clearActiveJob, setActiveJob } from "@/lib/job";

export async function POST(req: Request) {
  const jobId = randomUUID();

  let _transcript;
  let _error;
  let _durationMillis;
  const _actions: string[] = [];

  try {
    const maybeResp = await verifyAuth(req, {
      tag: "process-next",
    });
    if (maybeResp) return maybeResp;

    const recording = await db.query.recordings.findFirst({
      where: (t, { isNull, or }) =>
        or(
          isNull(t.transcript),
          isNull(t.filepathProcessed),
          isNull(t.durationMillis),
        ),
      orderBy: (t, { asc }) => asc(t.createdAt),
    });

    if (recording) {
      await setActiveJob({ id: jobId, type: "transcribe" });
    } else {
      return Response.json({
        transcript: _transcript,
        error: _error,
        durationMillis: _durationMillis,
        actions: _actions,
      });
    }

    if (!recording.transcript) {
      const { transcript, error } = await transcribeAudio({
        filepath: recording.filepath,
      });

      _transcript = transcript;
      _error = error;

      if (transcript) {
        await db
          .update(recordings)
          .set({
            transcript,
          })
          .where(eq(recordings.id, recording.id));

        const existingMessage = await db.query.messages.findMany({
          where: (t, { eq }) => eq(t.recordingId, recording.id),
        });
        await Promise.allSettled(
          existingMessage.map(async (msg) => {
            if (!msg.deviceChannelId || !msg.platformMessageId) return;
            await addTranscriptToVoiceMessage({
              chatId: msg.deviceChannelId,
              messageId: msg.platformMessageId,
              transcript,
            });
          }),
        );
      }
      _actions.push("transcript");
    }

    if (!recording.filepathProcessed) {
      const originalFilepath = recording.filepath;
      const parts = originalFilepath.split(".");
      parts.pop();
      const withoutExt = parts.join(".");
      const outputPath = `${withoutExt}-processed.mp3`;
      const { filepath: filepathProcessed } = await processAudio({
        filepath: originalFilepath,
        outputPath,
      });
      await db
        .update(recordings)
        .set({
          filepathProcessed,
        })
        .where(eq(recordings.id, recording.id));
      _actions.push("process-audio");
    }

    if (!recording.durationMillis) {
      const { durationMillis } = await getAudioDuration({
        filepath: recording.filepath,
      });
      await db
        .update(recordings)
        .set({
          durationMillis: String(durationMillis),
        })
        .where(eq(recordings.id, recording.id));
      _durationMillis = durationMillis;
      _actions.push("duration");
    }

    console.log(
      "recording/process-next actions:",
      _actions,
      _transcript,
      _durationMillis,
      _error,
    );
  } catch (err) {
    console.log("process-next error", err);
  } finally {
    await clearActiveJob(jobId);
  }

  return Response.json({
    transcript: _transcript,
    error: _error,
    durationMillis: _durationMillis,
    actions: _actions,
  });
}
