import { db } from "@/db";
import { recordings } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { transcribeAudio, processAudio, getAudioDuration } from "@/lib/audio";

export async function POST(req: Request) {
  const maybeResp = await verifyAuth(req, {
    tag: "process-next",
  });
  if (maybeResp) return maybeResp;

  let _transcript;
  let _error;
  let _durationMillis;

  const actions: string[] = [];

  const recording = await db.query.recordings.findFirst({
    where: (t, { isNull, or }) =>
      or(
        isNull(t.transcript),
        isNull(t.filepathProcessed),
        isNull(t.durationMillis),
      ),
    orderBy: (t, { asc }) => asc(t.createdAt),
  });

  if (!recording) {
    return new Response(null, { status: 404 });
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
    }
    actions.push("transcript");
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
    actions.push("process-audio");
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
    actions.push("duration");
  }

  console.log(
    "recording/process-next actions:",
    actions,
    _transcript,
    _durationMillis,
    _error,
  );

  return Response.json({
    transcript: _transcript,
    error: _error,
    durationMillis: _durationMillis,
    actions,
  });
}
