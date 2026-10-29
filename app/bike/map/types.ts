import z from "zod";

export const LatLngSchema = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);

export const WaypointSchema = z.object({
  id: z.number(),
  latlng: LatLngSchema,
  label: z.string(),
});

export type Waypoint = z.infer<typeof WaypointSchema>;

export type LatLng = z.infer<typeof LatLngSchema>;

export const BuiltRouteSchema = z.object({
  coordinates: z.array(LatLngSchema),
  distanceM: z.number().min(0),
  waypoints: z.array(WaypointSchema).nullable().optional(),
});

export type BuiltRoute = z.infer<typeof BuiltRouteSchema>;

export const SearchResultSchema = z.object({
  place_id: z.number().int(),
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export type RouteProgress = {
  traveled: LatLng[]; // route start up to the current position (inclusive)
  position: LatLng | null; // where you are now
  traveledM: number; // distance used, clamped to [0, totalM]
  totalM: number; // route length, measured from the geometry
  finished: boolean;
};


export const ElevationDiffSchema = z.object({
  fromM: z.number(),
  toM: z.number(),
  deltaM: z.number(),
})

export type ElevationDiff = z.infer<typeof ElevationDiffSchema>