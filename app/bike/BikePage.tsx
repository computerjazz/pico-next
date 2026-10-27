"use client";
import z from "zod";
import { useEffect, useRef, useState } from "react";

import { useSocket } from "../hooks/useSocket";

const BikeStatusSchema = z.object({
  type: z.literal("bike-status"),
  pulseCount: z.number(),
  timestamp: z.number(),
});

const METERS_PER_PULSE = 6;
const MPS_TO_MPH = 2.23694;
const MPS_TO_KPH = 3.6;
const MIN_IDLE_MS = 4000; // no pulse for at least this long => speed is 0

export default function BikePage({
  pulseCount: pulseCountProp,
}: {
  pulseCount?: number;
}) {
  const [pulseCount, setPulseCount] = useState<number>(pulseCountProp ?? 0);
  const [speed, setSpeed] = useState<number>(0); // meters per second

  // Refs hold the previous message so the handler never reads stale state
  const last = useRef<{ count: number; ts: number } | null>(null);
  const lastArrivalMs = useRef(0); // local clock, used only to detect "stopped"
  const lastIntervalMs = useRef(0);

  useSocket({
    groupId: "bike-status",
    onMessage: (payload) => {
      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        return;
      }
      const parsed = BikeStatusSchema.safeParse(json);
      if (!parsed.success) return;

      const { pulseCount: count, timestamp: ts } = parsed.data;
      const prev = last.current;

      last.current = { count, ts };
      lastArrivalMs.current = Date.now();
      setPulseCount(count);

      // First message has nothing to compare against
      if (!prev) return;

      const seconds = (ts - prev.ts) / 1000; // new minus old, both from the message
      const pulses = count - prev.count; // new minus old
      if (seconds > 0 && pulses > 0) {
        lastIntervalMs.current = seconds * 1000;
        setSpeed((pulses * METERS_PER_PULSE) / seconds);
      }
      // pulses <= 0 means the ESP32 restarted and its counter reset: skip
    },
  });

  // No messages arrive when you stop pedaling, so decay the speed to 0 on a timer
  useEffect(() => {
    const id = setInterval(() => {
      if (!last.current) return;
      const idleMs = Date.now() - lastArrivalMs.current;
      if (idleMs > Math.max(MIN_IDLE_MS, lastIntervalMs.current * 2)) {
        setSpeed(0);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  const distanceInMeters = pulseCount * METERS_PER_PULSE;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <h1 className="text-4xl font-bold mb-4">Bike Page</h1>
      <p className="text-lg text-gray-600">
        Total Distance: {(distanceInMeters / 1609.344).toFixed(2)} mi (
        {(distanceInMeters / 1000).toFixed(2)} km)
      </p>
      <p className="text-lg text-gray-600">
        Current Speed: {(speed * MPS_TO_MPH).toFixed(1)} mph (
        {(speed * MPS_TO_KPH).toFixed(1)} km/h)
      </p>
      <p className="text-lg text-gray-600">Pulse Count: {pulseCount}</p>
    </div>
  );
}
