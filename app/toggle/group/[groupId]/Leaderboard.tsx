"use client";
import { fetchGroupScoreAction } from "@/app/actions/fetchGroupScore";
import { toggleDevice } from "@/app/actions/toggleDevice";
import Switch from "@/app/components/Switch";
import { useSocket } from "@/app/hooks/useSocket";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Device } from "@/db/schema";
import { getHrsMinSecFromMillis } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ToggleGroupScore,
  ToggleGroupScoreSerializableSchema,
} from "@/lib/types";
import { useIsFocused } from "@/app/hooks/useIsFocused";

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
  const [modifiers, setModifiers] = useState<Record<string, number>>({});
  const isTestGroup = groupId === process.env.NEXT_PUBLIC_VIRTUAL_GROUP_ID; // TODO: cleanup
  const { isFocused } = useIsFocused();

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
    onMessage: (msgStr) => {
      const msg = JSON.parse(msgStr);
      const parsed = ToggleGroupScoreSerializableSchema.safeParse(msg);
      if (parsed.success) {
        const _score = {
          ...parsed.data,
          devices: parsed.data.devices.map((d) => {
            return {
              ...d,
              updatedAt: d.updatedAt ? new Date(d.updatedAt) : null,
            };
          }),
        };
        setScore(_score);
      }
    },
  });

  useEffect(() => {
    if (isFocused) {
      updateScore();
    }
  }, [updateScore, isFocused]);

  useEffect(() => {
    function reset() {
      setModifiers({});
    }

    reset();
    if (!score || score.devices.every((d) => d.role !== "active")) return;

    const interval = setInterval(() => {
      setModifiers((prev) => {
        const _mods = score.devices.reduce(
          (acc, cur) => {
            const deviceId = cur.deviceId;
            if (!deviceId) return acc;
            const isActive = cur.role === "active";
            const prevMod = prev[deviceId] ?? 0;
            const newModifier = isActive ? prevMod + 1 : 0;
            acc[deviceId] = newModifier;
            return acc;
          },
          {} as Record<string, number>,
        );
        return _mods;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [score]);

  if (!score) {
    return (
      <div className="p-4 space-y-4">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  const sortedDevices = score.devices
    .map((d) => {
      const deviceId = d.deviceId;
      const mod = deviceId ? modifiers[deviceId] || 0 : 0;
      return {
        ...d,
        points: d.points + mod,
      };
    })
    .sort((a, b) => {
      return a.points > b.points ? -1 : 1;
    });

  const leader = sortedDevices[0];
  const secondPlace = sortedDevices[1];

  const diffSeconds = (leader?.points || 0) - (secondPlace?.points || 0);

  const diff = getHrsMinSecFromMillis({ millis: diffSeconds * 1000 });
  return (
    <div className="p-4 space-y-4 flex flex-1 flex-col">
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
                <p className="text-lg font-semibold">
                  {device.points.toLocaleString()}
                </p>

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
      <div className="text-sm text-muted-foreground">
        <p>
          {`1 point is awarded each second a toggle is in scoring position (blue)`}
        </p>
        <p>
          {`${devices.get(leader?.deviceId ?? "")?.name ?? leader?.deviceId} is ahead by:`}
        </p>
        <p>{`${diffSeconds.toLocaleString()} (${diff.hours}hrs ${diff.minutes}min ${diff.seconds}sec)`}</p>
      </div>
    </div>
  );
}

export default Leaderboard;
