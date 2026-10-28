"use client";
import { useEffect, useState } from "react";

import { useLongpress } from "../../hooks/useLongpress";
import { resetBikePulseCount } from "../../actions/resetBikePulseCount";
import { useConfirm } from "../../components/ConfirmDialog";
import { useBikeSession } from "@/app/components/BIkeSessionProvider";

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
  const isPaused = sessionSeconds > 0 && speed === 0;

  const [blinkOn, setBlinkOn] = useState(true);

  useEffect(() => {
    const onUnpause = () => {
      setBlinkOn(true);
    };
    if (!isPaused) {
      onUnpause();
      return;
    }

    const id = setInterval(() => {
      setBlinkOn((prev) => !prev);
    }, 750);

    return () => clearInterval(id);
  }, [isPaused]);

  return (
    <div className="mb-6 text-center">
      <p className="text-lg font-medium uppercase tracking-widest text-muted-foreground">
        Current Session
      </p>
      <p
        className={`font-mono text-9xl font-bold tabular-nums tracking-tight wrap-anywhere ${!blinkOn && isPaused ? "text-accent-surface" : "text-accent"}`}
      >
        {formatTime(sessionSeconds)}
      </p>
      <p className="mt-1 text-lg text-muted-foreground">
        {speed > 0 ? "In motion" : isPaused ? "Paused" : "Ready to ride"}
      </p>
    </div>
  );
}

export default function BikeStats() {
  const { confirm, ConfirmDialog } = useConfirm();
  const { distanceInMeters, speed, speedInMph, sessionSeconds, pulseCount } =
    useBikeSession();
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
      className={`flex flex-1 flex-col items-center justify-center py-2 bg-background px-6`}
    >
      <div className={`${idle ? "opacity-10" : ""}`}>
        <SessionStats sessionSeconds={sessionSeconds} speed={speed} />
        <div className="flex flex-row gap-6 mt-6 flex-wrap" {...longpress}>
          <BikeStat
            label="Total Distance"
            value={`${(distanceInMeters / 1609.344).toFixed(2)} mi`}
          />
          <BikeStat
            label="Current Speed"
            value={`${speedInMph.toFixed(1)} mph`}
          />
          <BikeStat label="Revolutions" value={pulseCount.toString()} />
        </div>
        {ConfirmDialog}
      </div>
    </div>
  );
}
