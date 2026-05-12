import { randomUUID } from "crypto";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

export async function transcribeFile({ filepath }: { filepath: string }) {
  // convert to wav
  const tmpWav = `/tmp/${randomUUID()}.wav`;
  console.log(`[transcribe] converting to wav: ${tmpWav}`);
  await execAsync(
    `ffmpeg -i ${filepath} -ar 16000 -ac 1 -c:a pcm_s16le ${tmpWav} -y`,
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

  return {
    transcript: stdout.trim(),
    error: stderr,
  };
}
