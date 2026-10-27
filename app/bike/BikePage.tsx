"use client";
import z from "zod";

import { useSocket } from "../hooks/useSocket";
import { useState } from "react";

const BikeStatusSchema = z.object({
  type: z.literal("bike-status"),
  pulseCount: z.number(),
  timestamp: z.number(),
});

const METERS_PER_PULSE = 6;

export default function BikePage({
  pulseCount: pulseCountProp,
}: {
  pulseCount?: number;
}) {
  const [pulseCount, setPulseCount] = useState<number>(pulseCountProp ?? 0);
  const [timestamp, setTimestamp] = useState<number>(() => Date.now());
  const [speed, setSpeed] = useState<number>(0);
  const distanceInMeters = pulseCount * METERS_PER_PULSE;

  useSocket({
    groupId: "bike-status",
    onMessage: (payload) => {
      const parsed = BikeStatusSchema.safeParse(JSON.parse(payload));
      console.log("parsed!!!", payload, parsed);
      if (parsed.success) {
        const lastTimestamp = timestamp;
        const lastPulseCount = pulseCount;
        const timeDiffInSeconds = (lastTimestamp - Date.now()) / 1000;
        const pulseDiff = lastPulseCount - pulseCount;
        const speedInMetersPerSecond =
          timeDiffInSeconds > 0
            ? (pulseDiff * METERS_PER_PULSE) / timeDiffInSeconds
            : 0;
        setSpeed(speedInMetersPerSecond);
        setPulseCount(parsed.data.pulseCount);
        setTimestamp(parsed.data.timestamp);
      }
    },
  });
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <h1 className="text-4xl font-bold mb-4">Bike Page</h1>
      <p className="text-lg text-gray-600">
        Total Distance: {distanceInMeters} meters
      </p>
      <p className="text-lg text-gray-600">
        Current Speed: {speed.toFixed(2)} m/s
      </p>
      <p className="text-lg text-gray-600">Pulse Count: {pulseCount ?? 0}</p>
    </div>
  );
}
