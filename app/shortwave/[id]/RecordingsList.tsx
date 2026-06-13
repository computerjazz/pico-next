"use client";

import { Recording } from "@/db/schema";
import RecordingItem from "./RecordingItem";
import { AudioProvider } from "@/app/components/AudioProvider";
import { useLayoutEffect, useRef, useState } from "react";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { useSocket } from "@/app/hooks/useSocket";
import z from "zod";

const RecordingSchema = z.object({
  id: z.string(),
  deviceId: z.string().max(100).nullable(),
  createdAt: z.coerce.date(),
  filepath: z.string().max(512),
  filepathProcessed: z.string().max(512).nullable(),
  name: z.string().max(512).nullable(),
  contentType: z.string().max(25).nullable(),
  source: z.string().max(25).nullable(),
  transcript: z.string().nullable(),
  isShared: z.boolean().default(false),
  durationMillis: z.string().max(25).nullable(),
  deletedAt: z.coerce.date().nullable(),
});

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
    onMessage: (payload) => {
      console.log("message", payload);
      const parsed = RecordingSchema.safeParse(JSON.parse(payload));
      if (parsed.success) {
        console.log("success", parsed.data);
        setRecordings((prev) => [...prev, parsed.data]);
      }
    },
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
