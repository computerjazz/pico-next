import { LatLng, RouteProgress } from "./map/types";

const EARTH_RADIUS_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const formatTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const baseArr = [minutes, seconds];
  if (hours > 0) baseArr.unshift(hours);
  return baseArr.map((n) => String(n).padStart(2, "0")).join(":");
};

/** Total length of a route polyline, in meters. */
export function getRouteDistanceM(route?: LatLng[]): number {
  let total = 0;
  if (!route) return total;
  for (let i = 1; i < route.length; i++) {
    total += haversineM(route[i - 1], route[i]);
  }
  return total;
}

/**
 * Splits a route at `distanceM` meters from its start.
 * Distance beyond the end clamps to the end; negative or NaN counts as 0.
 */
export function splitRouteAtDistance(
  route: LatLng[],
  distanceM: number,
): RouteProgress {
  if (route.length < 2) {
    return {
      traveled: [],
      position: route[0] ?? null,
      traveledM: 0,
      totalM: 0,
      finished: false,
    };
  }

  const segs = route.slice(1).map((p, i) => haversineM(route[i], p));
  const totalM = segs.reduce((sum, s) => sum + s, 0);
  const target = Number.isFinite(distanceM)
    ? Math.min(Math.max(distanceM, 0), totalM)
    : 0;

  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= target) {
      const t = segs[i] === 0 ? 0 : (target - acc) / segs[i];
      const a = route[i];
      const b = route[i + 1];
      // Linear interpolation is accurate enough over road-segment lengths
      const position: LatLng = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ];
      return {
        traveled: [...route.slice(0, i + 1), position],
        position,
        traveledM: target,
        totalM,
        finished: target >= totalM,
      };
    }
    acc += segs[i];
  }

  // Unreachable in practice (floating-point safety net): you're at the end
  const end = route[route.length - 1];
  return {
    traveled: route,
    position: end,
    traveledM: totalM,
    totalM,
    finished: true,
  };
}

export const metersToKm = (m: number) => (m / 1000).toFixed(2);
export const metersToMiles = (m: number) => (m / 1609.344).toFixed(2);
