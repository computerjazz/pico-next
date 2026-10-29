"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useMapContext } from "./MapProvider";
import { CircleMarker, LeafletMouseEvent, Polyline } from "leaflet";
import { useBikeSession } from "./BikeSessionProvider";
import XCircle from "./icons/XCircle";
import MapPin from "./icons/MapPin";
import {
  getRouteDistanceM,
  haversineM,
  metersToKm,
  metersToMiles,
  splitRouteAtDistance,
} from "../bike/utils";
import { useLongpress } from "../hooks/useLongpress";
import Flag from "./icons/Flag";
import { useStableCallback } from "../hooks/useStableCallback";
import { LatLng, RouteProgress } from "../bike/map/types";
import { getElevationDiff } from "../bike/map/actions";

const FOLLOW_ZOOM = 18; // OSM tiles go to 19; 17 is a bit wider

function RiderButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-16 right-2 z-1001 cursor-pointer bg-background aspect-square flex self-end items-center justify-center text-foreground border border-foreground rounded-full p-2 m-2 hover:bg-foreground hover:text-background transition-colors"
    >
      <Flag />
    </button>
  );
}

function SearchPanel({
  follow,
  onFollow,
}: {
  follow?: boolean;
  onFollow?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
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
    mapRef,
    addWaypoint,
    fitMapToRoute,
  } = useMapContext();

  useEffect(() => {
    const map = mapRef.current;
    const handler = (e: LeafletMouseEvent) => {
      if (!isExpanded) return;
      const { lat, lng } = e.latlng;
      addWaypoint([lat, lng], `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    };
    map?.on("click", handler);

    return () => {
      map?.removeEventListener("click", handler);
    };
  }, [isExpanded, mapRef, addWaypoint]);

  const longpresss = useLongpress(() => setIsExpanded(true), 1000);

  return (
    <>
      <button
        type="button"
        {...longpresss}
        onClick={() => {
          if (isExpanded) setIsExpanded(false);
          else fitMapToRoute();
        }}
        className="absolute top-2 right-2 z-1001 cursor-pointer bg-background aspect-square flex self-end items-center justify-center text-foreground border border-foreground rounded-full p-2 m-2 hover:bg-foreground hover:text-background transition-colors"
      >
        {isExpanded ? <XCircle /> : <MapPin />}
      </button>
      {isExpanded && (
        <div
          ref={panelRef}
          className={`absolute top-14 right-16 z-1000 flex flex-col w-[290px] max-w-[calc(100%-16px)] max-h-[calc(100%-16px)] overflow-y-auto bg-background shadow-md text-foreground p-4 rounded-md text-sm`}
        >
          <form onSubmit={search} className="flex">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Address or place"
              className="flex-1 min-w-0 p-1 text-sm mr-1"
            />
            <button
              type="submit"
              disabled={busy}
              className="bg-background cursor-pointer text-foreground border border-foreground rounded-md py-1 px-2 hover:bg-foreground hover:text-background transition-colors"
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
                <li
                  key={w.id}
                  className="mb-1 p-4 rounded-md bg-surface flex justify-between"
                >
                  <span className="inline-block max-w-[190px] align-top">
                    {w.label}
                  </span>{" "}
                  <button
                    type="button"
                    className="cursor-pointer border-1 w-6 h-6 flex justify-center align-middle rounded-md aspect-square"
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
              {metersToKm(route.distanceM)} km ({metersToMiles(route.distanceM)}{" "}
              mi)
            </div>
          )}
          {message && <div className="text-destructive">{message}</div>}
          <div className="mt-2 text-xs text-muted-foreground">{locStatus}</div>
        </div>
      )}
    </>
  );
}

function ElevationStats({
  routeProgress,
}: {
  routeProgress?: RouteProgress | null;
}) {
  const [grade, setGrade] = useState(0);
  const curPos = routeProgress?.position;
  const lastPosRef = useRef(curPos);

  useEffect(() => {
    async function getGrade(fromLatLng: LatLng, toLatLng: LatLng) {
      const run = haversineM(fromLatLng, toLatLng)
      const { deltaM: rise } = await getElevationDiff({ fromLatLng, toLatLng });
      const slope = rise / run
      setGrade(slope)
    }

    const lastPos = lastPosRef.current;
    if (curPos && lastPos && lastPos !== curPos) {
      getGrade(curPos, lastPos);
    }
  }, [curPos]);

  function getGrade() {
    if (grade < 0.02) return {color: 'bg-green-600', label: 'easy' }
    if (grade < 0.5) return { color: "bg-yellow-600", label: 'moderate'};
    if (grade < 0.8) return { color: 'bg-orange-600', label: 'strenuous'}
    return  { color: 'bg-red-600', label: 'brutal'}
  }

  const { color, label } = getGrade()

  return <div className={`text-white p-4 rounded-md text-xl ${color}`}>{`${(grade * 100).toFixed(0)}% ${label}`}</div>;
}

function RouteStats() {
  const { totalDistanceM } = useBikeSession();
  const { route } = useMapContext();
  const routeDistanceM = getRouteDistanceM(route?.coordinates);
  const pct = totalDistanceM / routeDistanceM;

  return (
    <div className={`bg-surface text-foreground p-4 rounded-md text-xl`}>
      <span>{`${metersToMiles(totalDistanceM)} / ${metersToMiles(routeDistanceM)} mi (${(pct * 100).toFixed(2)}%)`}</span>
    </div>
  );
}

export default function RouteMap({ children }: { children?: React.ReactNode }) {
  const progressLineRef = useRef<Polyline | null>(null);
  const riderRef = useRef<CircleMarker | null>(null);
  const followingRef = useRef(false); // true once we've applied FOLLOW_ZOOM
  const [follow, setFollow] = useState(true);
  const { totalDistanceM, speed } = useBikeSession();

  const traveledM = totalDistanceM;

  const {
    route,
    containerRef,
    init,
    mapRef,
    leafletRef,
    ready,
    fitMapToRoute,
  } = useMapContext();

  useEffect(() => {
    init();
  }, [init]);

  const routeProgress = useMemo(() => {
    if (!route) return null;
    return splitRouteAtDistance(route.coordinates, traveledM);
  }, [route, traveledM]);

  const onFollow = useStableCallback(() => {
    const map = mapRef.current;
    if (!map || !route || !routeProgress) return;
    if (routeProgress.position) {
      map.setView(routeProgress.position, FOLLOW_ZOOM, { animate: true });
      setFollow(true);
    }
  });

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

    if (!routeProgress) {
      progressLineRef.current?.remove();
      riderRef.current?.remove();
      progressLineRef.current = null;
      riderRef.current = null;
      return;
    }

    // Update in place rather than recreating layers on every pulse
    if (progressLineRef.current) {
      progressLineRef.current.setLatLngs(routeProgress.traveled);
    } else {
      progressLineRef.current = L.polyline(routeProgress.traveled, {
        color: "#f97316",
        opacity: 1,
        weight: 6,
      }).addTo(map);
    }

    if (routeProgress.position) {
      if (riderRef.current) {
        riderRef.current.setLatLng(routeProgress.position);
      } else {
        riderRef.current = L.circleMarker(routeProgress.position, {
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

    if (follow && routeProgress.position && traveledM > 0) {
      map.setView(
        routeProgress.position,
        followingRef.current ? map.getZoom() : FOLLOW_ZOOM, // let manual zoom stick
        { animate: true },
      );
      followingRef.current = true;
    } else {
      followingRef.current = false; // re-enabling follow snaps back to FOLLOW_ZOOM
    }
  }, [route, traveledM, ready, leafletRef, mapRef, follow, routeProgress]);

  const isStandingStill = speed === 0;

  useEffect(() => {
    if (isStandingStill) {
      fitMapToRoute();
    } else {
      onFollow();
    }
  }, [isStandingStill, fitMapToRoute, onFollow]);

  return (
    <div className="relative flex-1">
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      <SearchPanel follow={follow} onFollow={onFollow} />
      <RiderButton onClick={onFollow} />
      <div className="absolute z-1000 left-2 bottom-2">
        <RouteStats />
      </div>
      <div className="absolute z-1000 right-2 bottom-2">
        <ElevationStats routeProgress={routeProgress} />
      </div>

      {children}
    </div>
  );
}
