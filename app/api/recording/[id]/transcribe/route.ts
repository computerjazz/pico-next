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
  console.log(
    `[transcribe] start recording=${recording.id} filepath=${recording.filepath}`,
  );

  // check binary exists and architecture
  const { stdout: lsOut } = await execAsync("ls -la /whisper/build/bin/").catch(
    (e) => ({ stdout: e.stderr }),
  );
  console.log(`[transcribe] whisper bin ls:\n${lsOut}`);

  const { stdout: fileOut } = await execAsync(
    "file /whisper/build/bin/whisper-cli",
  ).catch((e) => ({ stdout: e.stderr }));
  console.log(`[transcribe] whisper-cli file type: ${fileOut}`);

  const { stdout: archOut } = await execAsync("uname -m").catch((e) => ({
    stdout: e.stderr,
  }));
  console.log(`[transcribe] container arch: ${archOut.trim()}`);

  // check source file exists
  const { stdout: srcStat } = await execAsync(
    `stat ${recording.filepath}`,
  ).catch((e) => ({ stdout: e.stderr }));
  console.log(`[transcribe] source file stat: ${srcStat}`);

  // convert to wav
  const tmpWav = `/tmp/${randomUUID()}.wav`;
  console.log(`[transcribe] converting to wav: ${tmpWav}`);
  const { stdout: ffmpegOut, stderr: ffmpegErr } = await execAsync(
    `ffmpeg -i ${recording.filepath} -ar 16000 -ac 1 -c:a pcm_s16le ${tmpWav} -y`,
  ).catch((e) => ({ stdout: e.stdout, stderr: e.stderr }));
  console.log(`[transcribe] ffmpeg stdout: ${ffmpegOut}`);
  console.log(`[transcribe] ffmpeg stderr: ${ffmpegErr}`);

  // check wav was created
  const { stdout: wavStat } = await execAsync(`stat ${tmpWav}`).catch((e) => ({
    stdout: e.stderr,
  }));
  console.log(`[transcribe] wav stat: ${wavStat}`);

  // run whisper
  console.log(`[transcribe] running whisper-cli`);
  const whisperCmd = `/whisper/build/bin/whisper-cli -m /whisper/models/ggml-base.en.bin -f ${tmpWav} -nt`;
  console.log(`[transcribe] cmd: ${whisperCmd}`);
  const { stdout, stderr } = await execAsync(whisperCmd).catch((e) => ({
    stdout: e.stdout,
    stderr: e.stderr,
  }));
  console.log(`[transcribe] whisper stdout: ${stdout}`);
  console.log(`[transcribe] whisper stderr: ${stderr}`);

  // cleanup
  await execAsync(`rm ${tmpWav}`).catch((e) =>
    console.warn(`[transcribe] cleanup failed: ${e.message}`),
  );
  console.log(`[transcribe] done`);

  return Response.json({ transcript: stdout.trim(), error: stderr });
}
