"use client";

import { useEffect, useState, useRef } from "react";
// Import the server action (make sure this file exists as shown above!)
import { fetchGroupScoreAction } from "@/app/actions/fetchGroupScore"; // path may vary

type PageParams = {
  groupId: string;
};

function roleClass(role: "idle" | "active" | "challenger") {
  if (role === "active") return "text-blue-400";
  if (role === "challenger") return "text-red-400";
  return "text-green-400";
}

type Device = {
  deviceId: string;
  points: number;
  role: "idle" | "active" | "challenger";
  state: string;
};

type GroupScore = {
  groupId: string;
  devices: Device[];
  asOf: string;
  totalEvents: number;
};

export default function ToggleGroupPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const paramsRef = useRef<Promise<PageParams>>(params);
  const [score, setScore] = useState<GroupScore | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  // Get groupId and load initial data
  useEffect(() => {
    let cancelled = false;
    paramsRef.current = params;
    (async () => {
      const { groupId } = await params;
      setGroupId(groupId);
      try {
        const initialScore = await fetchGroupScoreAction(groupId);
        if (!cancelled) setScore(initialScore);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Set up websocket and reload the score on any message
  useEffect(() => {
    if (!groupId) return;

    let ws: WebSocket | null = null;
    let reconnect: NodeJS.Timeout | null = null;
    let stopped = false;

    async function reloadScore() {
      try {
        const latestScore = await fetchGroupScoreAction(groupId as string);
        setScore(latestScore);
      } catch {
        // ignore
      }
    }

    function connectSocket() {
      if (stopped) return;
      ws = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/api/ws",
      );

      ws.onopen = () => {
        // optionally: ws.send(JSON.stringify({ type: "register-dashboard" }));
      };

      ws.onmessage = () => {
        reloadScore();
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

    return () => {
      stopped = true;
      if (ws) ws.close();
      if (reconnect) clearTimeout(reconnect);
    };
  }, [groupId]);

  if (!score) {
    return (
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <h1 className="text-2xl font-bold">Toggle Leaderboard</h1>
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  const leader =
    [...score.devices].sort((left, right) => right.points - left.points)[0] ??
    null;

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Toggle Leaderboard</h1>
      <p className="text-sm text-neutral-500">
        Group: {score.groupId} | Events: {score.totalEvents} | Updated:{" "}
        {new Date(score.asOf).toLocaleString()}
      </p>
      {leader ? (
        <p className="text-sm">
          Leader: <span className="font-semibold">{leader.deviceId}</span> (
          {leader.points}s)
        </p>
      ) : null}
      <ul className="space-y-2">
        {score.devices.map((device) => (
          <li
            key={device.deviceId}
            className="rounded border border-neutral-800 p-3 flex items-center justify-between"
          >
            <div>
              <p className="font-medium">{device.deviceId}</p>
              <p className={`text-sm ${roleClass(device.role)}`}>
                {device.role.toUpperCase()} | state: {device.state}
              </p>
            </div>
            <p className="text-lg font-semibold">{device.points}s</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
