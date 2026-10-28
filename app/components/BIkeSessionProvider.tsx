"use client";

import { useEffect, useRef, useState } from "react";
import { useSocket } from "../hooks/useSocket";
import z from "zod";
import React from "react";

const BikeStatusSchema = z.object({
  type: z.literal("bike-status"),
  pulseCount: z.number(),
  timestamp: z.number(),
});

const METERS_PER_PULSE = 6;
const MIN_IDLE_MS = 4000; // no pulse for at least this long => speed is 0
const SESSION_RESET_MS = 10 * 60 * 1000;
const MPS_TO_MPH = 2.23694;

function useBikeSessionData({
  pulseCount: pulseCountProp,
}: {
  pulseCount?: number;
}) {
  const [pulseCount, setPulseCount] = useState<number>(pulseCountProp ?? 0);
  const [speed, setSpeed] = useState<number>(0); // meters per second

  const [sessionSeconds, setSessionSeconds] = useState(10);

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

  return {
    distanceInMeters,
    speedInMph: speed * MPS_TO_MPH,
    sessionSeconds,
    pulseCount,
    speed,
  };
}

type BikeSessionData = ReturnType<typeof useBikeSessionData>;

const BikeSessionContext = React.createContext<BikeSessionData | undefined>(
  undefined,
);

export const BikeSessionProvider = ({
  pulseCount,
  children,
}: {
  pulseCount?: number;
  children: React.ReactNode;
}) => {
  const sessionData = useBikeSessionData({ pulseCount });

  return (
    <BikeSessionContext.Provider value={sessionData}>
      {children}
    </BikeSessionContext.Provider>
  );
};

export function useBikeSession() {
  const ctx = React.useContext(BikeSessionContext);
  if (!ctx) {
    throw new Error(
      "useBikeSession() must be called within a BikeSessionProvider!",
    );
  }
  return ctx;
}
