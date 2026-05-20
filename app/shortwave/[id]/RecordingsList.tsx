"use client";

import { Recording } from "@/db/schema";
import RecordingItem from "./RecordingItem";
import { AudioProvider } from "@/app/components/AudioProvider";
import { useLayoutEffect, useRef, useState } from "react";
import { useStableCallback } from "@/app/hooks/useStableCallback";

export function RecordingsList({ recordings }: { recordings: Recording[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const onLoad = useStableCallback(() => setIsVisible(true));

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView();
    onLoad();
  }, [onLoad]);

  return (
    <AudioProvider>
      <div
        className={`flex flex-col flex-1 gap-2 transition-opacity duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        {recordings.map((r) => {
          return <RecordingItem key={r.id} recording={r} />;
        })}
        <div ref={bottomRef} />
      </div>
    </AudioProvider>
  );
}
