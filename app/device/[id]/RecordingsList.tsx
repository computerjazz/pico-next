"use client";

import { Recording } from "@/db/schema";
import RecordingItem from "./RecordingItem";
import { AudioProvider } from "@/app/components/AudioProvider";

export function RecordingsList({ recordings }: { recordings: Recording[] }) {
  return (
    <AudioProvider>
      <div className="flex flex-col flex-1 gap-2">
        {recordings.map((r) => {
          return <RecordingItem key={r.id} recording={r} />;
        })}
      </div>
    </AudioProvider>
  );
}
