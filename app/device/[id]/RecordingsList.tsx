"use client";

import { Recording } from "@/db/schema";
import RecordingItem from "./RecordingItem";
import { AudioProvider } from "@/app/components/AudioProvider";

export function RecordingsList({ recordings }: { recordings: Recording[] }) {
  return (
    <AudioProvider>
      <div className="flex flex-col flex-1 gap-2">
        {recordings.map((r) => {
          const isFromShortwave = r.source === "shortwave-device";
          return (
            <RecordingItem
              key={r.id}
              recording={r}
              className={`items-center max-w-md p-4 rounded-md ${isFromShortwave ? "bg-gray-800 self-start text-start items-start" : "bg-gray-900 self-end text-end items-end"}`}
            />
          );
        })}
      </div>
    </AudioProvider>
  );
}
