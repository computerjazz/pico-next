"use client";
import z from "zod";
import { useEffect, useRef, useState } from "react";

import { useSocket } from "../hooks/useSocket";
import { useLongpress } from "../hooks/useLongpress";
import { resetBikePulseCount } from "../actions/resetBikePulseCount";
import { useConfirm } from "../components/ConfirmDialog";

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

function BikeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-muted-surface p-6 rounded-lg shadow-md">
      <div className="text-2xl text-muted-foreground">{label}</div>
      <div className="text-4xl font-bold text-foreground">{value}</div>
    </div>
  );
}

const formatTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};

function SessionStats({
  sessionSeconds,
  speed,
}: {
  sessionSeconds: number;
  speed: number;
}) {
  return (
    <div className="mb-6 text-center">
      <p className="text-lg font-medium uppercase tracking-widest text-muted-foreground">
        Current Session
      </p>
      <p className="font-mono text-9xl font-bold tabular-nums tracking-tight text-foreground">
        {formatTime(sessionSeconds)}
      </p>
      <p className="mt-1 text-lg text-muted-foreground">
        {speed > 0
          ? "In motion"
          : sessionSeconds > 0
            ? "Paused"
            : "Ready to ride"}
      </p>
    </div>
  );
}

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
  const { confirm, ConfirmDialog } = useConfirm();

  const longpress = useLongpress(async () => {
    const shouldReset = await confirm({
      description: "Are you sure you want to reset biking distance?",
      destructive: true,
      confirmText: "Reset",
      cancelText: "Cancel",
    });

    if (shouldReset) {
      await resetBikePulseCount();
    }
  }, 1000);

  const paused = speed === 0;
  const idle = paused && sessionSeconds === 0;

  return (
    <div
      {...(idle ? { "data-theme": "dark" } : {})}
      className={`flex flex-col items-center justify-center min-h-screen py-2 bg-background`}
    >
      <div className={`${idle ? "opacity-10" : ""}`}>
        <SessionStats sessionSeconds={sessionSeconds} speed={speed} />
        <div className="flex flex-row gap-6 mt-6" {...longpress}>
          <BikeStat
            label="Total Distance"
            value={`${(distanceInMeters / 1609.344).toFixed(2)} mi (${(distanceInMeters / 1000).toFixed(2)} km)`}
          />
          <BikeStat
            label="Current Speed"
            value={`${(speed * MPS_TO_MPH).toFixed(1)} mph (${(speed * MPS_TO_KPH).toFixed(1)} km/h)`}
          />
          <BikeStat label="Revolutions" value={pulseCount.toString()} />
        </div>
        {ConfirmDialog}
      </div>
    </div>
  );
}
