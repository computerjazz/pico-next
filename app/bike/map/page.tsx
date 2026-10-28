"use client";

import { useEffect, useRef, useState } from "react";
// @ts-expect-error no types for leaflet in node_modules, but it works fine
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";

// Used until a location fix arrives (or if it's denied). Change to taste.
const FALLBACK_CENTER: [number, number] = [34.0869, -118.2702];
const DEFAULT_ZOOM = 15;

export default function LocationMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Locating…");

  useEffect(() => {
    let map: LeafletMap | undefined;
    let watchId: number | undefined;
    let cancelled = false;

    (async () => {
      // Imported inside the effect so Leaflet never runs during SSR
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current).setView(FALLBACK_CENTER, DEFAULT_ZOOM);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      if (!("geolocation" in navigator)) {
        setStatus("Geolocation not available");
        return;
      }

      // circleMarker avoids Leaflet's default-icon image path issues with bundlers
      const marker = L.circleMarker(FALLBACK_CENTER, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 1,
      });
      const accuracyCircle = L.circle(FALLBACK_CENTER, {
        radius: 0,
        color: "#2563eb",
        weight: 1,
        fillOpacity: 0.1,
      });
      let firstFix = true;

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!map) return;
          const latlng: [number, number] = [
            pos.coords.latitude,
            pos.coords.longitude,
          ];
          if (firstFix) {
            marker.addTo(map);
            accuracyCircle.addTo(map);
            map.setView(latlng, DEFAULT_ZOOM);
            firstFix = false;
          }
          marker.setLatLng(latlng);
          accuracyCircle.setLatLng(latlng).setRadius(pos.coords.accuracy);
          setStatus(`±${Math.round(pos.coords.accuracy)} m`);
        },
        (err) => setStatus(`Location unavailable: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
      );
    })();

    return () => {
      cancelled = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      map?.remove();
    };
  }, []);

  return (
    <div className="relative flex-1">
      <div ref={containerRef} className="w-full h-full" />
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 1000,
          background: "rgba(255,255,255,0.9)",
          color: "#111",
          padding: "4px 8px",
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        {status}
      </div>
    </div>
  );
}
