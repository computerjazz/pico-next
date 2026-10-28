import { useEffect, useRef, useState } from "react";
import {
  buildBikeRoute,
  BuiltRoute,
  searchPlaces,
  SearchResult,
} from "../bike/map/actions";
import { useStableCallback } from "../hooks/useStableCallback";
import React from "react";
import type { Map as LeafletMap, LayerGroup, Polyline } from "leaflet";

export type LatLng = [number, number]; // [lat, lon]
export type Waypoint = { id: number; latlng: LatLng; label: string };

// Used until a location fix arrives (or if it's denied). Change to taste.
const FALLBACK_CENTER: LatLng = [34.0869, -118.2702];
export const DEFAULT_ZOOM = 15;

function useMapState() {
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const waypointLayerRef = useRef<LayerGroup | null>(null);
  const routeLineRef = useRef<Polyline | null>(null);

  const nextId = useRef(1);

  const [ready, setReady] = useState(false);
  const [locStatus, setLocStatus] = useState("Locating…");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [route, setRoute] = useState<BuiltRoute | null>(null);
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
      const res = await buildBikeRoute(waypoints.map((w) => w.latlng));
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

  // --- Map setup + live location -------------------------------------------
  useEffect(() => {
    let map: LeafletMap | undefined;
    let watchId: number | undefined;
    let cancelled = false;

    (async () => {
      // Imported inside the effect so Leaflet never runs during SSR
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current).setView(FALLBACK_CENTER, DEFAULT_ZOOM);
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

      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        addWaypoint([lat, lng], `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      });

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
    })();

    return () => {
      cancelled = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [addWaypoint, initSentinel]);

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
          html: `<div style="width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#111;color:#fff;border:2px solid #fff;font:600 12px sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.5)">${i + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(layer);
    });
  }, [waypoints, ready]);

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
      opacity: 0.85,
    }).addTo(map);
    routeLineRef.current = line;
    map.fitBounds(line.getBounds(), { padding: [40, 40] });
  }, [route, ready]);

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

export function MapProvider({ children }: { children: React.ReactNode }) {
  const state = useMapState();
  return <MapContext.Provider value={state}>{children}</MapContext.Provider>;
}

export function useMapContext(): MapState {
  const ctx = React.useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used within a MapProvider");
  return ctx;
}
