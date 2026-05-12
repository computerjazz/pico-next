import { db } from "@/db";
import { recordings } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { transcribeAudio } from "@/lib/audio";

export async function POST(req: Request) {
  const maybeResp = await verifyAuth(req, {
    tag: "transcribe-next",
  });
  if (maybeResp) return maybeResp;

  const recording = await db.query.recordings.findFirst({
    where: (t, { isNull }) => isNull(t.transcript),
    orderBy: (t, { asc }) => asc(t.createdAt),
  });

  if (!recording) {
    return new Response(null, { status: 404 });
  }

  console.log(
    `[transcribe] start recording=${recording.id} filepath=${recording.filepath}`,
  );

  const { transcript, error } = await transcribeAudio({
    filepath: recording.filepath,
  });

  if (transcript) {
    console.log("transcription success!!", transcript);
    await db
      .update(recordings)
      .set({
        transcript,
      })
      .where(eq(recordings.id, recording.id));
  }

  return Response.json({ transcript, error });
}
