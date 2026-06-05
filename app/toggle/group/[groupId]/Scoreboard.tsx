"use client";
import { fetchGroupScoreAction } from "@/app/actions/fetchGroupScore";
import { generateToken } from "@/app/actions/generateToken";
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

function Scoreboard({
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

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnect: NodeJS.Timeout | null = null;
    let stopped = false;

    function connectSocket() {
      if (stopped) return;
      ws = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/api/ws",
      );

      ws.onopen = async () => {
        const token = await generateToken({ scope: "websocket" });
        ws?.send(
          JSON.stringify({
            type: "register",
            token,
            groupId,
            id: `${groupId}-client-${Math.floor(Math.random() * 100000)}`,
          }),
        );
      };

      ws.onmessage = () => {
        updateScore();
      };

      ws.onclose = () => {
        if (!stopped) {
          reconnect = setTimeout(connectSocket, 2000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connectSocket();
    // load initial score
    updateScore();

    return () => {
      stopped = true;
      if (ws) ws.close();
      if (reconnect) clearTimeout(reconnect);
    };
  }, [updateScore, groupId]);

  if (!score) {
    return (
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  const leader =
    [...score.devices].sort((left, right) => right.points - left.points)[0] ??
    null;

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
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
            const isLeader = leader.deviceId === device.deviceId;
            return (
              <Link
                key={device.deviceId}
                className={`rounded p-3 flex items-center justify-between ${isLeader ? "bg-accent-surface" : "bg-muted-surface"}`}
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

export default Scoreboard;
