import { db } from "@/db";
import { devices } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { readdir } from "node:fs/promises";
import path from "node:path";

type RouteParams = { id: string };

function sanitizeVersion(raw: string) {
  return raw.replace(/[-._]/g, "");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const deviceId = (await params).id;
  console.log(`OTA: check from device: ${deviceId}`);

  const maybeResp = await verifyAuth(req, {
    tag: "device/:id/ota",
    method: "GET",
  });
  if (maybeResp) {
    console.log(`OTA: auth failed for device: ${deviceId}`);
    return maybeResp;
  }

  const device = await db.query.devices.findFirst({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
  });

  if (!device) {
    console.log(`OTA: no device found for id: ${deviceId}`);
    return Response.json(
      {
        success: false,
      },
      { status: 404 },
    );
  }

  const currentVersion = req.headers.get("x-firmware-version") ?? "unknown";
  const sanitizedCurrentVersion = sanitizeVersion(currentVersion);
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
  const sanitizedOtaVersion = sanitizeVersion(otaVersion);
  const updateAvailable =
    otaVersion !== "unknown" && sanitizedOtaVersion > sanitizedCurrentVersion;
  const firmwareUrl = updateAvailable
    ? `/${device.type}/bin/${encodeURIComponent(otaVersion)}/${device.type}.ino.bin`
    : null;

  await db
    .update(devices)
    .set({
      firmwareVersion: currentVersion,
    })
    .where(eq(devices.deviceId, deviceId));

  const payload = {
    deviceType: device.type,
    currentVersion,
    otaVersion,
    updateAvailable,
    firmwareUrl,
  };

  console.log(`OTA check complete: ${JSON.stringify(payload)}`);

  return Response.json(payload, { status: 200 });
}
