"use client";
import z from "zod";

import { useSocket } from "../hooks/useSocket";

const BikeStatusSchema = z.object({
  type: z.literal("bike-status"),
  pulseCount: z.number(),
});

export default function BikePage() {
  useSocket({
    groupId: "bike-status",
    onMessage: (payload) => {
      const parsed = BikeStatusSchema.safeParse(JSON.parse(payload));
      console.log("parsed!!!", payload, parsed);
      if (parsed.success) {
        // Handle the parsed bike status update
      }
    },
  });
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <h1 className="text-4xl font-bold mb-4">Bike Page</h1>
      <p className="text-lg text-gray-600">Welcome to the Bike Page!</p>
    </div>
  );
}
