import { randomUUID } from "crypto";
import { promisify } from "util";
import { exec, spawn } from "child_process";
import os from "os";
import path from "path";
const execAsync = promisify(exec);

export async function getAudioDuration({ filepath }: { filepath: string }) {
  // Use execAsync and destructure stdout directly for clarity.
  const { stdout } = await execAsync(
    `ffprobe -i "${filepath}" -show_entries format=duration -v quiet -of csv="p=0"`,
  );

  // Trim output and parse as float; guard against parse failure/NaN.
  const trimmed = stdout.trim();
  const durationSec = parseFloat(trimmed);

  // If result is NaN, return durationMillis as 0, or handle as needed.
  return {
    durationSec: isNaN(durationSec) ? 0 : durationSec,
    durationMillis: isNaN(durationSec) ? 0 : durationSec * 1000,
  };
}

export async function getTmpOggAudioFile({ filepath }: { filepath: string }) {
  // Ensure the file extension is .ogg for voice
  const outputPath = path.join(
    os.tmpdir(),
    "tg_voice_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2) +
      ".ogg",
  );
  // ffmpeg: mono, 48kHz sample rate, opus codec, 64k bitrate
  await execAsync(
    [
      "ffmpeg",
      "-y",
      "-i",
      filepath,
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "libopus",
      "-b:a",
      "64k",
      outputPath,
    ].join(" "),
  );

  return { filepath: outputPath };
}

export async function transcribeAudio({ filepath }: { filepath: string }) {
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

export async function convertAudioToMp3({
  inputFilepath,
  outputFilepath,
}: {
  inputFilepath: string;
  outputFilepath: string;
}) {
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      inputFilepath,
      "-acodec",
      "libmp3lame",
      "-ab",
      "128k",
      "-y",
      outputFilepath,
    ]);

    ffmpeg.stdout.on("data", (data) => console.log(data.toString()));
    ffmpeg.stderr.on("data", (data) => console.log(data.toString()));

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
  console.log("wrote audio file", outputFilepath);
  return { outputFilepath };
}

export async function processAudio({
  filepath,
  fadeOutDurationSec = 0,
  outputPath,
}: {
  filepath: string;
  outputPath: string;
  fadeOutDurationSec?: number;
}) {
  /** Trim tail (e.g. mic/button release click) before dynamics processing. */
  const tailChopSec = 0.05;

  // Speech-focused processing for phone playback:
  // band-limit to voice range, compress dynamics, then normalize loudness.
  const speechFilter =
    "highpass=f=120,lowpass=f=4200,acompressor=threshold=-24dB:ratio=3:attack=20:release=250:makeup=6,loudnorm=I=-16:TP=-1.5:LRA=7";
  let finalFilter = speechFilter;

  const { durationSec } = await getAudioDuration({ filepath });

  if (durationSec > tailChopSec) {
    const trimEnd = durationSec - tailChopSec;
    finalFilter = `atrim=end=${trimEnd},asetpts=PTS-STARTPTS,${finalFilter}`;
  }

  const hasFade = fadeOutDurationSec > 0;
  if (hasFade) {
    const effDuration =
      durationSec > tailChopSec ? durationSec - tailChopSec : durationSec;
    console.log(
      "Duration:",
      durationSec,
      "effective (after tail chop):",
      effDuration,
    );
    const fadeStart = effDuration - fadeOutDurationSec;
    finalFilter = `${finalFilter},afade=t=out:st=${fadeStart}:d=${fadeOutDurationSec}`;
  }
  try {
    // ffmpeg: mono, 48kHz sample rate, opus codec, 64k bitrate
    await execAsync(
      ["ffmpeg", "-y", "-i", filepath, "-af", finalFilter, outputPath].join(
        " ",
      ),
    );
    return { filepath: outputPath };
  } catch (err) {
    throw new Error("Failed to process audio" + err);
  }
}
