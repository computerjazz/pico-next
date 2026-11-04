"use client";

import { useEffect, useRef, useState } from "react";
import { useSocket } from "../hooks/useSocket";
import z from "zod";
import React from "react";
import { IS_DEV } from "@/lib/constants";

const BikeStatusSchema = z.object({
  type: z.literal("bike-status"),
  pulseCount: z.number(),
  timestamp: z.number(),
});

type BikeStatus = z.infer<typeof BikeStatusSchema>;

const METERS_PER_PULSE = 6;
const MIN_IDLE_MS = 4000; // no pulse for at least this long => speed is 0
const SESSION_RESET_MS = 10 * 60 * 1000;
const MPS_TO_MPH = 2.23694;

function useBikeSessionData({
  pulseCount: pulseCountProp,
}: {
  pulseCount?: number;
}) {
  const [bikeStatus, setBikeStatus] = useState<BikeStatus>(() => ({
    type: "bike-status",
    pulseCount: pulseCountProp ?? 0,
    timestamp: Date.now(),
  }));

  const pulseCount = bikeStatus.pulseCount;
  const [speed, setSpeed] = useState<number>(0); // meters per second

  const [sessionSeconds, setSessionSeconds] = useState(1);
  const [sessionPulseInit, setSessionPulseInit] = useState(pulseCount);

  const sessionStartMs = useRef<number | null>(null);
  const accumulatedMs = useRef(0);
  const stoppedAtMs = useRef<number | null>(null);

  // Refs hold the previous message so the handler never reads stale state
  const prevBikeStatus = useRef<BikeStatus>(bikeStatus);
  const lastIntervalMs = useRef(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (IS_DEV) {
      interval = setInterval(() => {
        setBikeStatus((bs) => ({
          type: "bike-status",
          pulseCount: bs.pulseCount + 1,
          timestamp: Date.now(),
        }));
      }, 1800);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const prev = prevBikeStatus.current;
    prevBikeStatus.current = bikeStatus;

    // First message has nothing to compare against
    if (!prev) return;

    const seconds = (bikeStatus.timestamp - prev.timestamp) / 1000; // new minus old, both from the message
    const pulses = bikeStatus.pulseCount - prev.pulseCount; // new minus old
    if (seconds > 0 && pulses > 0) {
      lastIntervalMs.current = seconds * 1000;
      setSpeed((pulses * METERS_PER_PULSE) / seconds);
    }
  }, [bikeStatus]);

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
      const bikeStatusData = parsed.data;
      setBikeStatus(bikeStatusData);
    },
  });

  const isMoving = speed > 0;

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();

      if (isMoving) {
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
          setSessionPulseInit(prevBikeStatus.current.pulseCount);
        }
      }
    }, 250);

    return () => clearInterval(id);
  }, [isMoving]);

  // No messages arrive when you stop pedaling, so decay the speed to 0 on a timer
  useEffect(() => {
    const id = setInterval(() => {
      if (!prevBikeStatus.current) return;
      const idleMs = Date.now() - prevBikeStatus.current.timestamp;
      if (idleMs > Math.max(MIN_IDLE_MS, lastIntervalMs.current * 2)) {
        setSpeed(0);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  const sessionPulseCount = pulseCount - sessionPulseInit;

  const totalDistanceM = pulseCount * METERS_PER_PULSE;
  const sessionDistanceM = sessionPulseCount * METERS_PER_PULSE;

  return {
    totalDistanceM,
    sessionDistanceM,
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
