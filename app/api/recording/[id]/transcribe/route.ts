import { db } from "@/db";
import { recordings } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { exec } from "child_process";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { promisify } from "util";

const execAsync = promisify(exec);
type RouteParams = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const maybeResp = await verifyAuth(req, {
    tag: "answering-machine/mp3",
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

  // convert to wav
  const tmpWav = `/tmp/${randomUUID()}.wav`;
  console.log(`[transcribe] converting to wav: ${tmpWav}`);
  await execAsync(
    `ffmpeg -i ${recording.filepath} -ar 16000 -ac 1 -c:a pcm_s16le ${tmpWav} -y`,
  ).catch((e) => ({ stdout: e.stdout, stderr: e.stderr }));

  // run whisper
  const whisperCmd = `LD_LIBRARY_PATH=/whisper/bin nice -n 19 /whisper/bin/whisper-cli -m /whisper/models/ggml-base.en.bin -f ${tmpWav} -nt`;

  console.log(`[transcribe] cmd: ${whisperCmd}`);
  const { stdout, stderr } = await execAsync(whisperCmd).catch((e) => ({
    stdout: e.stdout,
    stderr: e.stderr,
  }));

  // cleanup
  await execAsync(`rm ${tmpWav}`).catch((e) =>
    console.warn(`[transcribe] cleanup failed: ${e.message}`),
  );
  console.log(`[transcribe] done`);

  const transcription = stdout.trim();

  if (transcription) {
    console.log("transcription success!!", transcription);
    await db
      .update(recordings)
      .set({
        transcription,
      })
      .where(eq(recordings.id, recordingId));
  }

  return Response.json({ transcript: stdout.trim(), error: stderr });
}
