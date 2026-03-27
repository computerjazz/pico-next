export function getJsonSizeBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function extractAuthToken(authHeader?: string | null) {
  const authPrefix = "Bearer ";
  if (!authHeader?.startsWith(authPrefix)) {
    return null;
  }

  const token = authHeader.slice(authPrefix.length);
  return token;
}
