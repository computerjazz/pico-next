import crypto from "crypto";

const num = (v: string | null, min: number, max: number, fallback?: number) => {
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = num(searchParams.get("lat"), -90, 90);
  const lng = num(searchParams.get("lng"), -180, 180);
  if (lat === undefined || lng === undefined) {
    return new Response("Bad request", { status: 400 });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/streetview");

  url.search = new URLSearchParams({
    size: "640x400",
    location: `${lat},${lng}`,
    key: process.env.GOOGLE_MAPS_API_KEY!,
  }).toString();

  const secret = Buffer.from(
    process.env
      .GOOGLE_MAPS_SIGNING_SECRET!.replace(/-/g, "+")
      .replace(/_/g, "/"),
    "base64",
  );

  const heading = num(searchParams.get("heading"), 0, 360);
  const pitch = num(searchParams.get("pitch"), -90, 90);
  const fov = num(searchParams.get("fov"), 10, 120);
  if (heading !== undefined) url.searchParams.set("heading", String(heading));
  if (pitch !== undefined) url.searchParams.set("pitch", String(pitch));
  if (fov !== undefined) url.searchParams.set("fov", String(fov));

  const signature = crypto
    .createHmac("sha1", secret)
    .update(url.pathname + url.search)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const upstream = await fetch(`${url.toString()}&signature=${signature}`);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
