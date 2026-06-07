import { db } from "@/db";
import { recordings } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { transcribeAudio } from "@/lib/audio";

type RouteParams = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const maybeResp = await verifyAuth(req, {
    tag: "recording/:id/transcribe",
  });
  if (maybeResp) return maybeResp;

  const recordingId = (await params).id;
  const recording = await db.query.recordings.findFirst({
    where: (t, { eq }) => eq(t.id, recordingId),
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
    await db
      .update(recordings)
      .set({
        transcript,
      })
      .where(eq(recordings.id, recordingId));
  }

  return Response.json({ transcript, error });
}
