"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { splitRouteAtDistance, useMapContext } from "./MapProvider";
import { CircleMarker, Polyline } from "leaflet";
import { useBikeSession } from "./BIkeSessionProvider";

const FOLLOW_ZOOM = 18; // OSM tiles go to 19; 17 is a bit wider

function SearchPanel({
  follow,
  onFollow,
}: {
  follow?: boolean;
  onFollow?: () => void;
}) {
  const {
    panelRef,
    query,
    search,
    setQuery,
    results,
    pickResult,
    waypoints,
    removeWaypoint,
    buildRoute,
    route,
    message,
    locStatus,
    busy,
    clearAll,
  } = useMapContext();

  return (
    <div
      ref={panelRef}
      className="absolute top-2 right-2 z-1000 w-[290px] max-w-[calc(100%-16px)] max-h-[calc(100%-16px)] overflow-y-auto bg-background text-foreground p-2 rounded-md text-sm shadow-md"
    >
      <form onSubmit={search} className="flex">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an address or place"
          className="flex-1 min-w-0 p-1 text-sm mr-1"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-background text-foreground border border-foreground rounded-md py-1 px-2 hover:bg-foreground hover:text-background transition-colors"
        >
          Search
        </button>
      </form>

      {results.length > 0 && (
        <ul className="m-0 p-0 list-none">
          {results.map((r) => (
            <li key={r.place_id} className="mb-1">
              <button
                type="button"
                onClick={() => pickResult(r)}
                className="text-left w-full p-1 rounded hover:bg-muted-surface transition-colors"
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="font-bold mt-2">Route stops</div>
      {waypoints.length === 0 ? (
        <div className="text-muted-foreground text-sm mt-1">
          Search for a place or click the map to add the first stop.
        </div>
      ) : (
        <ol className="m-0 p-0">
          {waypoints.map((w) => (
            <li key={w.id} className="mb-1">
              <span className="inline-block max-w-[190px] align-top">
                {w.label}
              </span>{" "}
              <button
                type="button"
                onClick={() => removeWaypoint(w.id)}
                aria-label={`Remove stop ${w.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={buildRoute}
          disabled={busy || waypoints.length < 2}
          className="bg-background text-foreground border border-foreground rounded-md py-1 px-2 hover:bg-foreground hover:text-background transition-colors"
        >
          Build bike route
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={waypoints.length === 0}
          className="bg-background text-foreground border border-foreground rounded-md py-1 px-2 hover:bg-foreground hover:text-background transition-colors"
        >
          Clear
        </button>
      </div>

      {route && !follow && (
        <button
          type="button"
          onClick={onFollow}
          className="mt-2 bg-background text-foreground border border-foreground rounded-md py-1 px-2 hover:bg-foreground hover:text-background transition-colors"
        >
          Follow rider
        </button>
      )}

      {route && (
        <div style={{ marginTop: 8, fontWeight: 600 }}>
          {(route.distanceM / 1000).toFixed(2)} km (
          {(route.distanceM / 1609.344).toFixed(2)} mi)
        </div>
      )}
      {message && <div className="text-destructive">{message}</div>}
      <div className="mt-2 text-xs text-muted-foreground">{locStatus}</div>
    </div>
  );
}

export default function RouteMap() {
  const progressLineRef = useRef<Polyline | null>(null);
  const riderRef = useRef<CircleMarker | null>(null);
  const followingRef = useRef(false); // true once we've applied FOLLOW_ZOOM
  const [follow, setFollow] = useState(true);
  const { distanceInMeters } = useBikeSession();

  const traveledM = distanceInMeters;

  const { route, containerRef, init, mapRef, leafletRef, ready } =
    useMapContext();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pause = () => setFollow(false);
    map.on("dragstart", pause);
    return () => {
      map.off("dragstart", pause);
    };
  }, [ready, mapRef]);

  // --- Paint distance traveled along the route -------------------------------
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    // The map is recreated on remount (init() bumps initSentinel), so layers from a
    // previous map instance are dead. Forget any that aren't on the current map.
    if (progressLineRef.current && !map.hasLayer(progressLineRef.current)) {
      progressLineRef.current = null;
    }
    if (riderRef.current && !map.hasLayer(riderRef.current)) {
      riderRef.current = null;
    }

    if (!route) {
      progressLineRef.current?.remove();
      riderRef.current?.remove();
      progressLineRef.current = null;
      riderRef.current = null;
      return;
    }

    const p = splitRouteAtDistance(route.coordinates, traveledM);

    // Update in place rather than recreating layers on every pulse
    if (progressLineRef.current) {
      console.log("Updating progress line to", p.traveled);
      progressLineRef.current.setLatLngs(p.traveled);
    } else {
      console.log("Creating progress line at", p.traveled);
      progressLineRef.current = L.polyline(p.traveled, {
        color: "#f97316",
        opacity: 1,
        weight: 6,
      }).addTo(map);
    }

    if (p.position) {
      if (riderRef.current) {
        console.log("Updating rider position to", p);
        riderRef.current.setLatLng(p.position);
      } else {
        console.log("Creating rider marker at", p);
        riderRef.current = L.circleMarker(p.position, {
          radius: 9,
          color: "#111",
          weight: 3,
          fillColor: "#f97316",
          fillOpacity: 1,
        }).addTo(map);
      }
    }

    // A rebuilt route draws on top of these, so lift them back up
    progressLineRef.current.bringToFront();
    riderRef.current?.bringToFront();

    if (follow && p.position && traveledM > 0) {
      map.setView(
        p.position,
        followingRef.current ? map.getZoom() : FOLLOW_ZOOM, // let manual zoom stick
        { animate: false },
      );
      followingRef.current = true;
    } else {
      followingRef.current = false; // re-enabling follow snaps back to FOLLOW_ZOOM
    }
  }, [route, traveledM, ready, leafletRef, mapRef, follow]);

  return (
    <div className="relative flex-1">
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      <SearchPanel follow={follow} onFollow={() => setFollow(true)} />
    </div>
  );
}
