export function getJsonSizeBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function isTruthy<T>(v: T): v is NonNullable<T> {
  return !!v;
}

export function formatAudioDuration({
  durationMillis,
}: {
  durationMillis: string;
}) {
  const ms = parseInt(durationMillis, 10);
  if (isNaN(ms)) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
