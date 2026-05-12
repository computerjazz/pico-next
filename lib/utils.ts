export function getJsonSizeBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function isTruthy<T>(v: T): v is NonNullable<T> {
  return !!v;
}
