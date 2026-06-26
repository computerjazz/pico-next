import { z } from "zod";

export const ToggleDeviceScoreSchema = z.object({
  deviceId: z.string().nullable().optional(),
  state: z.string(),
  role: z.enum(["idle", "active", "challenger"]),
  points: z.number(),
  updatedAt: z.union([z.date(), z.null()]).optional(),
});

export const ToggleGroupScoreSchema = z.object({
  groupId: z.string().nullable(),
  asOf: z.string(),
  phase: z.enum(["aligned", "contested"]),
  activeDeviceId: z.string().nullable(),
  devices: z.array(ToggleDeviceScoreSchema),
});

export type ToggleDeviceScore = z.infer<typeof ToggleDeviceScoreSchema>;
export type ToggleGroupScore = z.infer<typeof ToggleGroupScoreSchema>;

// Serializeable types/schemas where dates are represented as strings (ISO). Reuse as much as possible.

export const ToggleDeviceScoreSerializableSchema =
  ToggleDeviceScoreSchema.extend({
    updatedAt: z.union([z.string(), z.null()]).optional(),
  });

export const ToggleGroupScoreSerializableSchema = ToggleGroupScoreSchema.extend(
  {
    devices: z.array(ToggleDeviceScoreSerializableSchema),
  },
);

export type ToggleDeviceScoreSerializable = z.infer<
  typeof ToggleDeviceScoreSerializableSchema
>;
export type ToggleGroupScoreSerializable = z.infer<
  typeof ToggleGroupScoreSerializableSchema
>;
