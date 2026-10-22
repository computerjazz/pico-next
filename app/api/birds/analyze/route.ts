import { verifyAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const BIRDNET_URL = process.env.BIRDNET_URL ?? "http://birdnet-api:8000";
const BIRDNET_TOKEN = process.env.BIRDNET_API_TOKEN ?? "";
const DEVICE_TOKEN = process.env.BIRD_DEVICE_TOKEN ?? "";

function num(v: string | null, min: number, max: number): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
}

export async function POST(req: NextRequest) {
  const maybeErr = await verifyAuth(req, {
    method: "POST",
    tag: "birds/analyze",
  });

  if (maybeErr) return maybeErr;

  const incoming = await req.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

  // Accept lat/lon/min_conf as query params or form fields (query wins).
  const q = req.nextUrl.searchParams;
  const pick = (k: string) => q.get(k) ?? (incoming.get(k) as string | null);
  const lat = num(pick("lat"), -90, 90);
  const lon = num(pick("lon") ?? pick("lng"), -180, 180);
  const minConf = num(pick("min_conf"), 0, 1);

  if ([lat, lon, minConf].some((n) => Number.isNaN(n))) {
    return NextResponse.json(
      { error: "invalid lat/lon/min_conf" },
      { status: 400 },
    );
  }
  if ((lat === null) !== (lon === null)) {
    return NextResponse.json(
      { error: "lat and lon must be sent together" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  if (lat !== null && lon !== null) {
    params.set("lat", String(lat));
    params.set("lon", String(lon));
  }
  if (minConf !== null) params.set("min_conf", String(minConf));

  const upstream = new FormData();
  upstream.append("file", file, file.name || "clip.wav");

  const res = await fetch(`${BIRDNET_URL}/analyze?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${BIRDNET_TOKEN}` },
    body: upstream,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "analysis failed" }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}
