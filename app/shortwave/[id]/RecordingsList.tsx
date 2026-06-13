"use client";

import { Recording } from "@/db/schema";
import RecordingItem from "./RecordingItem";
import { AudioProvider } from "@/app/components/AudioProvider";
import { useLayoutEffect, useRef, useState } from "react";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { useSocket } from "@/app/hooks/useSocket";

export function RecordingsList({
  recordings: initialRecordings,
  autoScroll = true,
}: {
  recordings: Recording[];
  autoScroll?: boolean;
}) {
  const [recordings, setRecordings] = useState(initialRecordings);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const socketGroupId = recordings[0]?.deviceId;
  useSocket({
    groupId: socketGroupId,
    onMessage: (payload) => console.log("message!!!", payload),
  });
  const onLoad = useStableCallback(() => setIsVisible(true));

  useLayoutEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView();
    }
    onLoad();
  }, [onLoad, autoScroll]);

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
