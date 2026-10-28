"use client";

import { useEffect, useRef, useState } from "react";
import { buildBikeRoute, searchPlaces } from "../bike/map/actions";
import { useStableCallback } from "../hooks/useStableCallback";
import React from "react";
import type { Map as LeafletMap, LayerGroup, Polyline } from "leaflet";

import { BuiltRoute, LatLng, SearchResult, Waypoint } from "../bike/map/types";

// Used until a location fix arrives (or if it's denied). Change to taste.
const FALLBACK_CENTER: LatLng = [34.0869, -118.2702];
export const DEFAULT_ZOOM = 15;

function useMapState({ route: initialRoute }: { route: BuiltRoute | null }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const waypointLayerRef = useRef<LayerGroup | null>(null);
  const routeLineRef = useRef<Polyline | null>(null);

  const nextId = useRef(1);

  const [ready, setReady] = useState(false);
  const [locStatus, setLocStatus] = useState("Locating…");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>(
    initialRoute?.waypoints || [],
  );
  const [route, setRoute] = useState<BuiltRoute | null>(initialRoute);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [initSentinel, setInitSentinel] = useState(1);

  const init = useStableCallback(() => {
    setInitSentinel((prev) => prev + 1);
  });

  const addWaypoint = useStableCallback((latlng: LatLng, label: string) => {
    setWaypoints((prev) => [...prev, { id: nextId.current++, latlng, label }]);
    setRoute(null); // any change to the stops invalidates the built route
  });

  // --- Actions (calls go through server actions, so no CORS) ----------------
  const search = useStableCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await searchPlaces(q);
      if (!res.ok) throw new Error(res.error);
      setResults(res.data);
      if (res.data.length === 0)
        setMessage("No matches. Try a fuller address.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  });

  const pickResult = useStableCallback(function (r: SearchResult) {
    const latlng: LatLng = [parseFloat(r.lat), parseFloat(r.lon)];
    addWaypoint(latlng, r.display_name);
    mapRef.current?.setView(latlng, DEFAULT_ZOOM);
    setResults([]);
    setQuery("");
  });

  const removeWaypoint = useStableCallback(function (id: number) {
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
    setRoute(null);
  });

  const clearAll = useStableCallback(function () {
    setWaypoints([]);
    setRoute(null);
    setMessage("");
  });

  const buildRoute = useStableCallback(async function () {
    if (waypoints.length < 2 || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await buildBikeRoute({ waypoints });
      if (!res.ok) throw new Error(res.error);
      // TODO: this is the object to save (Postgres/Drizzle) so progress can later be
      // computed locally: walk `coordinates` by (pulses x ~6 m) to find the current point.
      setRoute(res.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  });

  // --- Draw the built route ------------------------------------------------
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    routeLineRef.current?.remove();
    routeLineRef.current = null;
    if (!route) return;
    const line = L.polyline(route.coordinates, {
      color: "#2563eb",
      weight: 5,
      opacity: 0.5,
    }).addTo(map);
    routeLineRef.current = line;
    map.fitBounds(line.getBounds(), { padding: [40, 40] });
  }, [route, ready, initSentinel]);

  // --- Draw numbered waypoint markers --------------------------------------
  useEffect(() => {
    const L = leafletRef.current;
    const layer = waypointLayerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    waypoints.forEach((w, i) => {
      L.marker(w.latlng, {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#111;color:#fff;border:2px solid #fff;font:600 12px sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.5)"><span>${i + 1}</span></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(layer);
    });
  }, [waypoints, ready, initSentinel]);

  const mapCleanupRef = useRef<(() => void) | null>(null);

  // --- Map setup + live location -------------------------------------------
  // React calls this with null when the div unmounts, and with the element when it mounts
  const containerRef = useStableCallback((el: HTMLDivElement | null) => {
    // Tear down whatever map this ref was previously attached to
    mapCleanupRef.current?.();
    mapCleanupRef.current = null;
    if (!el) return;

    let cancelled = false;
    let map: LeafletMap | undefined;
    let watchId: number | undefined;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return; // unmounted while Leaflet was loading

      map = L.map(el).setView(FALLBACK_CENTER, DEFAULT_ZOOM);
      mapRef.current = map;
      leafletRef.current = L;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Routing: <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a>',
      }).addTo(map);

      waypointLayerRef.current = L.layerGroup().addTo(map);

      // Clicks/scrolls on the panel shouldn't reach the map underneath
      if (panelRef.current) {
        L.DomEvent.disableClickPropagation(panelRef.current);
        L.DomEvent.disableScrollPropagation(panelRef.current);
      }

      setReady(true);

      if (!("geolocation" in navigator)) {
        setLocStatus("Geolocation not available");
        return;
      }

      // circleMarker avoids Leaflet's default-icon image path issues with bundlers
      const me = L.circleMarker(FALLBACK_CENTER, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 1,
      });
      const accuracy = L.circle(FALLBACK_CENTER, {
        radius: 0,
        color: "#2563eb",
        weight: 1,
        fillOpacity: 0.1,
      });
      let firstFix = true;

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!map) return;
          const latlng: LatLng = [pos.coords.latitude, pos.coords.longitude];
          if (firstFix) {
            me.addTo(map);
            accuracy.addTo(map);
            map.setView(latlng, DEFAULT_ZOOM);
            firstFix = false;
          }
          me.setLatLng(latlng);
          accuracy.setLatLng(latlng).setRadius(pos.coords.accuracy);
          setLocStatus(`Location ±${Math.round(pos.coords.accuracy)} m`);
        },
        (err) => setLocStatus(`Location unavailable: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
      );

      setReady(true);
    })();

    mapCleanupRef.current = () => {
      cancelled = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      map?.remove();
      mapRef.current = null;
      waypointLayerRef.current = null;
      routeLineRef.current = null;
      setReady(false);
    };
  });

  return {
    ready,
    setReady,
    locStatus,
    setLocStatus,
    query,
    setQuery,
    results,
    setResults,
    waypoints,
    setWaypoints,
    route,
    setRoute,
    busy,
    setBusy,
    message,
    setMessage,
    addWaypoint,
    containerRef,
    panelRef,
    mapRef,
    leafletRef,
    waypointLayerRef,
    search,
    pickResult,
    removeWaypoint,
    clearAll,
    buildRoute,
    init,
  };
}

type MapState = ReturnType<typeof useMapState>;

const MapContext = React.createContext<MapState | null>(null);

export function MapProvider({
  children,
  initialRoute,
}: {
  children: React.ReactNode;
  initialRoute: BuiltRoute | null;
}) {
  const state = useMapState({ route: initialRoute });
  return <MapContext.Provider value={state}>{children}</MapContext.Provider>;
}

export function useMapContext(): MapState {
  const ctx = React.useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used within a MapProvider");
  return ctx;
}

export type RouteProgress = {
  traveled: LatLng[]; // route start up to the current position (inclusive)
  position: LatLng | null; // where you are now
  traveledM: number; // distance used, clamped to [0, totalM]
  totalM: number; // route length, measured from the geometry
  finished: boolean;
};

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
