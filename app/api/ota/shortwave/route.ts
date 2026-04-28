import { db } from "@/db";
import { devices } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { readdir } from "node:fs/promises";
import path from "node:path";

export async function GET(req: Request) {
  const maybeResp = await verifyAuth(req, {
    tag: "ota/shortwave",
    method: "GET",
  });
  if (maybeResp) return maybeResp;

  const currentVersion = req.headers.get("x-firmware-version") ?? "unknown";
  const deviceId = req.headers.get("x-device-id") ?? "unknown";
  const binDir = path.join(process.cwd(), "public", "shortwave", "bin");
  const entries = await readdir(binDir, { withFileTypes: true }).catch(
    () => [],
  );
  const versionDirs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => entry.name),
  );
  const otaVersion =
    versionDirs.sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    )[0] ?? currentVersion;
  const updateAvailable =
    otaVersion !== "unknown" && otaVersion > currentVersion;
  const firmwareUrl = updateAvailable
    ? `/shortwave/bin/${encodeURIComponent(otaVersion)}/shortwave.ino.bin`
    : null;

  await db
    .update(devices)
    .set({
      firmwareVersion: currentVersion,
    })
    .where(eq(devices.deviceId, deviceId));

  return Response.json(
    {
      deviceType: "shortwave",
      currentVersion,
      otaVersion,
      updateAvailable,
      firmwareUrl,
    },
    { status: 200 },
  );
}
