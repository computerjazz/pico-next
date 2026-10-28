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
