"use server";

import { getRedis, REDIS_KEYS } from "@/lib/redis";
import { BuiltRoute, SearchResult, Waypoint } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const ROUTER = "https://routing.openstreetmap.de/routed-bike/route/v1/driving";
// Nominatim requires an identifying User-Agent
const HEADERS = { "User-Agent": "picopi-bike-map/1.0 (hi@picopi.cc)" };

export async function searchPlaces(q: string): Promise<Result<SearchResult[]>> {
  // TODO: auth check here, e.g. const session = await auth(); if (!session) ...
  const query = q.trim();
  if (!query || query.length > 200)
    return { ok: false, error: "Invalid search" };

  try {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "5",
    });
    const res = await fetch(`${NOMINATIM}?${params}`, { headers: HEADERS });
    if (!res.ok)
      return { ok: false, error: `Search failed (HTTP ${res.status})` };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: "Search service unreachable" };
  }
}

export async function buildBikeRoute({
  waypoints,
}: {
  waypoints: Waypoint[];
}): Promise<Result<BuiltRoute>> {
  // TODO: same auth  check

  const redis = await getRedis();
  const points = waypoints.map((p) => p.latlng);
  const valid =
    Array.isArray(points) &&
    points.length >= 2 &&
    points.length <= 25 &&
    points.every(
      (p) =>
        Array.isArray(p) &&
        Number.isFinite(p[0]) &&
        Math.abs(p[0]) <= 90 &&
        Number.isFinite(p[1]) &&
        Math.abs(p[1]) <= 180,
    );
  if (!valid) return { ok: false, error: "Need 2–25 valid points" };

  try {
    const coords = points.map(([lat, lon]) => `${lon},${lat}`).join(";");
    const res = await fetch(
      `${ROUTER}/${coords}?overview=full&geometries=geojson`,
      {
        headers: HEADERS,
      },
    );
    if (!res.ok)
      return { ok: false, error: `Routing failed (HTTP ${res.status})` };

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) {
      return {
        ok: false,
        error: data.message ?? data.code ?? "No route found",
      };
    }
    const r = data.routes[0];
    const routeData: BuiltRoute = {
      // GeoJSON is [lon, lat]; Leaflet wants [lat, lon]
      coordinates: r.geometry.coordinates.map(
        ([lon, lat]: [number, number]) => [lat, lon],
      ),
      waypoints,
      distanceM: r.distance,
    };
    await redis.set(REDIS_KEYS.BIKE_ROUTE, JSON.stringify(routeData));
    return {
      ok: true,
      data: routeData,
    };
  } catch {
    return { ok: false, error: "Routing service unreachable" };
  }
}
