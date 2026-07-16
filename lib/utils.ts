export function getJsonSizeBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function isTruthy<T>(v: T): v is NonNullable<T> {
  return !!v;
}

export function getHrsMinSecFromMillis({ millis }: { millis: number }) {
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
  const seconds = totalSeconds - hours * 3600 - minutes * 60;
  return { hours, minutes, seconds };
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

export function getProductNameFromDeviceType({
  type,
}: {
  type?: string | null;
}) {
  if (!type) return "";
  if (type === "shortwave") return "sh0rtwave";
  if (type === "toggle") return "Toggle";
  return type;
}
