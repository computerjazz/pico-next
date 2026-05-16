"use client";

import { Recording } from "@/db/schema";
import RecordingItem from "./RecordingItem";
import { AudioProvider } from "@/app/components/AudioProvider";
import { useLayoutEffect, useRef } from "react";

export function RecordingsList({ recordings }: { recordings: Recording[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  return (
    <AudioProvider>
      <div className="flex flex-col flex-1 gap-2">
        {recordings.map((r) => {
          return <RecordingItem key={r.id} recording={r} />;
        })}
        <div ref={bottomRef} />
      </div>
    </AudioProvider>
  );
}
