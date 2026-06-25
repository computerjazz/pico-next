"use client";
import React from "react";
import { fetchGroupScoreAction } from "@/app/actions/fetchGroupScore";
import { toggleDevice } from "@/app/actions/toggleDevice";
import Switch from "@/app/components/Switch";
import { useSocket } from "@/app/hooks/useSocket";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Device } from "@/db/schema";
import { ToggleGroupScore } from "@/lib/toggle-score";
import { getHrsMinSecFromMillis } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

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
  const [score, setScore] = useState<ToggleGroupScore | null>(null);
  const allIdle = score?.devices.every((d) => d.role === "idle");

  const isTestGroup = groupId === process.env.NEXT_PUBLIC_VIRTUAL_GROUP_ID; // TODO: cleanup

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

  const leader = score.devices.reduce((acc, cur) => {
    return cur.points > acc.points ? cur : acc;
  }, score.devices[0]);

  const diffSeconds = score.devices.reduce((acc, cur) => {
    return Math.abs(acc - cur.points);
  }, 0);

  const diff = getHrsMinSecFromMillis({ millis: diffSeconds * 1000 });
  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        {`${devices.get(leader?.deviceId ?? "")?.name ?? leader?.deviceId} is ahead by ${diff.hours}hrs ${diff.minutes}min ${diff.seconds}sec`}
      </p>
      <ul className="space-y-2">
        {score.devices
          .sort((a, b) => {
            return a.points > b.points ? -1 : 1;
          })
          .map((device) => {
            return (
              <motion.div
                key={device.deviceId}
                layout
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                }}
              >
                <Link
                  className={`rounded p-3 flex items-center justify-between bg-muted-surface`}
                  href={`/toggle/${device.deviceId}`}
                >
                  <div className="flex gap-2 items-center">
                    <div
                      className={`w-2 h-2 rounded-full ${roleClass(device.role)}`}
                    />
                    <p className="font-medium">
                      {devices.get(device.deviceId ?? "")?.name ||
                        device.deviceId}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">{device.points}</p>
                </Link>
                {isTestGroup && (
                  <Switch
                    isOn={device.state === "on"}
                    onChange={async () => {
                      // Make a POST request to /device/:id with a JSON payload of the new state
                      await toggleDevice({
                        deviceId: device.deviceId,
                        state: device.state === "on" ? "off" : "on",
                      });
                    }}
                  />
                )}
              </motion.div>
            );
          })}
      </ul>
    </div>
  );
}

export default Leaderboard;
