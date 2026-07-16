"use client";

import { Recording } from "@/db/schema";
import RecordingItem from "./RecordingItem";
import { AudioProvider } from "@/app/components/AudioProvider";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

const NewRecordingMessageSchema = z.object({
  type: z.string(),
  recording: RecordingSchema,
});

// function createDummyRecording() {
//   return {
//     id: `${Date.now()}`,
//     deviceId: "my-device",
//     createdAt: new Date(),
//     filepath: "/fake/path",
//     filepathProcessed: null,
//     name: null,
//     contentType: "mp3",
//     source: null,
//     transcript: `test ${new Date().toTimeString()}`,
//     isShared: false,
//     durationMillis: "1234",
//     deletedAt: null,
//   };
// }

export function RecordingsList({
  recordings: initialRecordings,
  autoScroll = true,
  isScrolledUp,
}: {
  recordings: Recording[];
  autoScroll?: boolean;
  isScrolledUp?: boolean;
}) {
  const [recordings, setRecordings] = useState(initialRecordings);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const socketGroupId = recordings[0]?.deviceId;

  useEffect(() => {
    setRecordings(initialRecordings);
  }, [initialRecordings]);

  // useEffect(() => {
  //   setInterval(() => {
  //     setRecordings((prev) => [...prev, createDummyRecording()]);
  //   }, 3000);
  // }, []);

  const lengthDiff = recordings.length - initialRecordings.length;
  const onNewRecording = useStableCallback(() => {
    if (!isScrolledUp && lengthDiff > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  useEffect(() => {
    onNewRecording();
  }, [lengthDiff, onNewRecording]);

  useSocket({
    groupId: socketGroupId,
    onMessage: (payload) => {
      const parsed = NewRecordingMessageSchema.safeParse(JSON.parse(payload));
      if (parsed.success) {
        setRecordings((prev) => [...prev, parsed.data.recording]);
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
        ref={containerRef}
        className={`flex flex-col flex-1 gap-2 transition-opacity duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        {recordings.map((r) => {
          return (
            <RecordingItem
              key={r.id}
              recording={r}
              onDelete={(delR) => {
                setRecordings((prev) => {
                  return prev.filter((prevR) => prevR.id !== delR.id);
                });
              }}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </AudioProvider>
  );
}
