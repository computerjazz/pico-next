import { db } from "@/db";
import { devices } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { readdir } from "node:fs/promises";
import path from "node:path";

type RouteParams = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const maybeResp = await verifyAuth(req, {
    tag: "ota/shortwave",
    method: "GET",
  });
  if (maybeResp) return maybeResp;
  const deviceId = (await params).id;

  const device = await db.query.devices.findFirst({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
  });

  if (!device) {
    return Response.json(
      {
        success: false,
      },
      { status: 404 },
    );
  }

  const currentVersion = req.headers.get("x-firmware-version") ?? "unknown";
  const binDir = path.join(process.cwd(), "public", device.type, "bin");
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
    ? `/${device.type}/bin/${encodeURIComponent(otaVersion)}/${device.type}.ino.bin`
    : null;

  await db
    .update(devices)
    .set({
      firmwareVersion: currentVersion,
    })
    .where(eq(devices.deviceId, deviceId));

  return Response.json(
    {
      deviceType: device.type,
      currentVersion,
      otaVersion,
      updateAvailable,
      firmwareUrl,
    },
    { status: 200 },
  );
}
