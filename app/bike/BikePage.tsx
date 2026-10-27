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
const SESSION_RESET_MS = 10 * 60 * 1000;

const formatTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};

export default function BikePage({
  pulseCount: pulseCountProp,
}: {
  pulseCount?: number;
}) {
  const [pulseCount, setPulseCount] = useState<number>(pulseCountProp ?? 0);
  const [speed, setSpeed] = useState<number>(0); // meters per second

  const [sessionSeconds, setSessionSeconds] = useState(0);

  const sessionStartMs = useRef<number | null>(null);
  const accumulatedMs = useRef(0);
  const stoppedAtMs = useRef<number | null>(null);

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

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();

      if (speed > 0) {
        // Resume a paused session, or start a new one.
        if (sessionStartMs.current === null) {
          sessionStartMs.current = now;
        }

        stoppedAtMs.current = null;

        setSessionSeconds(
          Math.floor(
            (accumulatedMs.current + (now - sessionStartMs.current)) / 1000,
          ),
        );
      } else {
        // Freeze the elapsed time when motion stops.
        if (sessionStartMs.current !== null) {
          accumulatedMs.current += now - sessionStartMs.current;
          sessionStartMs.current = null;
          stoppedAtMs.current = now;

          setSessionSeconds(Math.floor(accumulatedMs.current / 1000));
        }

        // Reset after 10 minutes stopped.
        if (
          stoppedAtMs.current !== null &&
          now - stoppedAtMs.current >= SESSION_RESET_MS
        ) {
          accumulatedMs.current = 0;
          sessionStartMs.current = null;
          stoppedAtMs.current = null;
          setSessionSeconds(0);
        }
      }
    }, 250);

    return () => clearInterval(id);
  }, [speed]);

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
      <div className="mb-6 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-gray-500">
          Current Session
        </p>
        <p className="font-mono text-6xl font-bold tabular-nums tracking-tight text-gray-900">
          {formatTime(sessionSeconds)}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {speed > 0
            ? "In motion"
            : sessionSeconds > 0
              ? "Paused"
              : "Ready to ride"}
        </p>
      </div>
      <p className="text-lg text-gray-600">
        Total Distance: {(distanceInMeters / 1609.344).toFixed(2)} mi (
        {(distanceInMeters / 1000).toFixed(2)} km)
      </p>
      <p className="text-lg text-gray-600">
        Current Speed: {(speed * MPS_TO_MPH).toFixed(1)} mph (
        {(speed * MPS_TO_KPH).toFixed(1)} km/h)
      </p>
      <p className="text-lg text-gray-600">Revolutions: {pulseCount}</p>
    </div>
  );
}
