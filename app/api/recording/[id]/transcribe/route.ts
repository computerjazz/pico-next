import { db } from "@/db";
import { verifyAuth } from "@/lib/auth";
import { exec } from "child_process";
import { randomUUID } from "crypto";
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

  const tmpWav = `/tmp/${randomUUID()}.wav`;
  await execAsync(
    `ffmpeg -i ${recording.filepath} -ar 16000 -ac 1 -c:a pcm_s16le ${tmpWav}`,
  );

  const { stdout } = await execAsync(
    `nice -n 19 /whisper/build/bin/whisper-cli -m /whisper/models/ggml-base.en.bin -f ${tmpWav} -nt 2>/dev/null`,
  );

  await execAsync(`rm ${tmpWav}`);

  return Response.json({ transcript: stdout.trim() });
}
