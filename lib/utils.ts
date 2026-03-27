export function getJsonSizeBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
