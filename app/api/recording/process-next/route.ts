import { db } from "@/db";
import { recordings } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { transcribeAudio, processAudio } from "@/lib/audio";

export async function POST(req: Request) {
  const maybeResp = await verifyAuth(req, {
    tag: "process-next",
  });
  if (maybeResp) return maybeResp;

  const recordingMissingTranscript = await db.query.recordings.findFirst({
    where: (t, { isNull }) => isNull(t.transcript),
    orderBy: (t, { asc }) => asc(t.createdAt),
  });

  const recordingMissingProcessedMp3 = await db.query.recordings.findFirst({
    where: (t, { isNull }) => isNull(t.filepathProcessed),
  });

  const recording = recordingMissingTranscript || recordingMissingProcessedMp3;

  if (!recording) {
    return new Response(null, { status: 404 });
  }

  const action = recordingMissingTranscript ? "transcribe" : "process";

  console.log(
    `[${action}] start recording=${recording.id} filepath=${recording.filepath}`,
  );

  if (recordingMissingTranscript) {
    const { transcript, error } = await transcribeAudio({
      filepath: recordingMissingTranscript.filepath,
    });

    if (transcript) {
      console.log("transcription success!!", transcript);
      await db
        .update(recordings)
        .set({
          transcript,
        })
        .where(eq(recordings.id, recordingMissingTranscript.id));
    }
    return Response.json({ transcript, error });
  } else if (recordingMissingProcessedMp3) {
    const originalFilepath = recordingMissingProcessedMp3.filepath;
    const parts = originalFilepath.split(".");
    parts.pop();
    const withoutExt = parts.join(".");
    const outputPath = `${withoutExt}-processed.mp3`;
    console.log(`processing ${outputPath}`);
    const { filepath: filepathProcessed } = await processAudio({
      filepath: recordingMissingProcessedMp3.filepath,
      outputPath,
    });
    await db
      .update(recordings)
      .set({
        filepathProcessed,
      })
      .where(eq(recordings.id, recordingMissingProcessedMp3.id));
    return Response.json({ success: true });
  }
}
