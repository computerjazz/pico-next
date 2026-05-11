"use client";

import { Recording } from "@/db/schema";
import RecordingItem from "./RecordingItem";
import { AudioProvider } from "@/app/components/AudioProvider";

export function RecordingsList({ recordings }: { recordings: Recording[] }) {
  return (
    <AudioProvider>
      {recordings.map((r) => {
        return (
          <div key={r.id} className="flex items-center space-x-2">
            <RecordingItem recording={r} />
          </div>
        );
      })}
    </AudioProvider>
  );
}
