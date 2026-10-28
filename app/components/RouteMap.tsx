"use client";

import { useEffect, useRef } from "react";
//@ts-expect-error leaflet has no types for the default export, only the named exports
import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap, Polyline } from "leaflet";
import { useMapContext, LatLng } from "./MapProvider";

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 1000,
  width: 290,
  maxWidth: "calc(100% - 16px)",
  maxHeight: "calc(100% - 16px)",
  overflowY: "auto",
  background: "rgba(255,255,255,0.96)",
  color: "#111",
  padding: 10,
  borderRadius: 6,
  fontSize: 13,
  boxShadow: "0 1px 6px rgba(0,0,0,0.3)",
};

const buttonStyle: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 13,
  border: "1px solid #999",
  borderRadius: 4,
  background: "#f3f3f3",
  color: "#111",
  cursor: "pointer",
};

export default function RouteMap() {
  const {
    locStatus,
    query,
    setQuery,
    results,
    waypoints,
    route,
    busy,
    message,
    containerRef,
    panelRef,
    search,
    pickResult,
    removeWaypoint,
    clearAll,
    buildRoute,
    init,
  } = useMapContext();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="relative flex-1">
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />

      <div ref={panelRef} style={panelStyle}>
        <form onSubmit={search} style={{ display: "flex" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search an address or place"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "5px 6px",
              fontSize: 13,
              marginRight: 6,
            }}
          />
          <button type="submit" disabled={busy} style={buttonStyle}>
            Search
          </button>
        </form>

        {results.length > 0 && (
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
            {results.map((r) => (
              <li key={r.place_id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  style={{ ...buttonStyle, width: "100%", textAlign: "left" }}
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 10, fontWeight: 600 }}>Route stops</div>
        {waypoints.length === 0 ? (
          <div style={{ color: "#555", marginTop: 4 }}>
            Search for a place or click the map to add the first stop.
          </div>
        ) : (
          <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            {waypoints.map((w) => (
              <li key={w.id} style={{ marginBottom: 3 }}>
                <span
                  style={{
                    display: "inline-block",
                    maxWidth: 190,
                    verticalAlign: "top",
                  }}
                >
                  {w.label}
                </span>{" "}
                <button
                  type="button"
                  onClick={() => removeWaypoint(w.id)}
                  aria-label={`Remove stop ${w.label}`}
                  style={{ ...buttonStyle, padding: "0 6px" }}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}

        <div style={{ marginTop: 10, display: "flex" }}>
          <button
            type="button"
            onClick={buildRoute}
            disabled={busy || waypoints.length < 2}
            style={{ ...buttonStyle, marginRight: 6 }}
          >
            Build bike route
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={waypoints.length === 0}
            style={buttonStyle}
          >
            Clear
          </button>
        </div>

        {route && (
          <div style={{ marginTop: 8, fontWeight: 600 }}>
            {(route.distanceM / 1000).toFixed(2)} km (
            {(route.distanceM / 1609.344).toFixed(2)} mi)
          </div>
        )}
        {message && (
          <div style={{ marginTop: 8, color: "#b00020" }}>{message}</div>
        )}
        <div style={{ marginTop: 8, color: "#555", fontSize: 12 }}>
          {locStatus}
        </div>
      </div>
    </div>
  );
}
