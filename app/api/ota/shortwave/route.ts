import { verifyAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const maybeResp = await verifyAuth(req, {
    tag: "ota/shortwave",
    method: "GET",
  });
  if (maybeResp) return maybeResp;

  const currentVersion = req.headers.get("x-firmware-version") ?? "unknown";
  const otaVersion = process.env.OTA_SHORTWAVE_VERSION ?? currentVersion;
  const updateAvailable =
    otaVersion !== "unknown" && otaVersion > currentVersion;
  const firmwareUrl = updateAvailable
    ? `/shortwave/bin/${encodeURIComponent(otaVersion)}/shortwave.ino.bin`
    : null;

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
