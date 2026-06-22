"use client";
import { fetchGroupScoreAction } from "@/app/actions/fetchGroupScore";
import { useSocket } from "@/app/hooks/useSocket";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Device } from "@/db/schema";
import Link from "next/link";
import { useEffect, useState } from "react";

type DeviceStats = {
  deviceId: string;
  points: number;
  role: "idle" | "active" | "challenger";
  state: string;
};

type GroupScore = {
  groupId: string;
  devices: DeviceStats[];
  asOf: string;
  totalEvents: number;
};

function roleClass(role: "idle" | "active" | "challenger") {
  if (role === "active") return "bg-blue-400";
  if (role === "challenger") return "bg-red-400";
  return "bg-green-400";
}

function Leaderboard({
  groupId,
  devices,
}: {
  groupId: string;
  devices: Map<string, Device>;
}) {
  const [score, setScore] = useState<GroupScore | null>(null);
  const allIdle = score?.devices.every((d) => d.role === "idle");

  const updateScore = useStableCallback(async function reloadScore() {
    try {
      const latestScore = await fetchGroupScoreAction({ groupId });
      setScore(latestScore);
    } catch {
      // ignore
    }
  });

  useSocket({
    groupId,
    onMessage: updateScore,
  });

  useEffect(() => {
    // update initial score
    updateScore();
  }, [updateScore]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (!allIdle) {
      interval = setInterval(() => {
        updateScore();
      }, 5000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [allIdle, updateScore]);

  if (!score) {
    return (
      <div className="p-4 space-y-4">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Events: {score.totalEvents} | Updated:{" "}
        {new Date(score.asOf).toLocaleString()}
      </p>
      <ul className="space-y-2">
        {score.devices
          .sort((a, b) => {
            return a.points > b.points ? -1 : 1;
          })
          .map((device) => {
            return (
              <Link
                key={device.deviceId}
                className={`rounded p-3 flex items-center justify-between bg-muted-surface`}
                href={`/toggle/${device.deviceId}`}
              >
                <div className="flex gap-2 items-center">
                  <div
                    className={`w-2 h-2 rounded-full ${roleClass(device.role)}`}
                  />
                  <p className="font-medium">
                    {devices.get(device.deviceId)?.name || device.deviceId}
                  </p>
                </div>
                <p className="text-lg font-semibold">{device.points}</p>
              </Link>
            );
          })}
      </ul>
    </div>
  );
}

export default Leaderboard;
