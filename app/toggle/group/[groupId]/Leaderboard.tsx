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

  const sortedDevices = [...score.devices].sort((a, b) => {
    return a.points > b.points ? -1 : 1;
  });

  const leader = sortedDevices[0];
  const secondPlace = sortedDevices[1];

  const diffSeconds = (leader?.points || 0) - (secondPlace?.points || 0);

  const diff = getHrsMinSecFromMillis({ millis: diffSeconds * 1000 });
  return (
    <div className="p-4 space-y-4 flex flex-1 flex-col">
      <div className="text-sm text-muted-foreground">
        <p>
          {`${devices.get(leader?.deviceId ?? "")?.name ?? leader?.deviceId} is ahead by:`}
        </p>
        <p>{`${diff.hours}hrs ${diff.minutes}min ${diff.seconds}sec`}</p>
      </div>
      <ul className="space-y-2 flex flex-1 flex-col">
        {sortedDevices.map((device) => {
          return (
            <motion.div
              key={device.deviceId}
              layout
              className="flex flex-col"
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
              }}
            >
              <div
                className={`rounded p-3 flex items-center justify-between bg-muted-surface`}
              >
                <Link
                  className="flex gap-2 items-center"
                  href={`/toggle/${device.deviceId}`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${roleClass(device.role)}`}
                  />
                  <p className="font-medium">
                    {devices.get(device.deviceId ?? "")?.name ||
                      device.deviceId}
                  </p>
                </Link>
                <p className="text-lg font-semibold">{device.points}</p>
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
              </div>
            </motion.div>
          );
        })}
      </ul>
    </div>
  );
}

export default Leaderboard;
