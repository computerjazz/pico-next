"use client";

import { getRecording } from "@/app/actions/getRecording";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Recording } from "@/db/schema";
import { useMemo, useRef, useState } from "react";

function PlayCircle() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z"
      />
    </svg>
  );
}

function PauseCircle() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function useAudio({ recordingId }: { recordingId: string }) {
  const [audioUrl, setAudioUrl] = useState<Buffer<ArrayBuffer> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fetchAudio = useStableCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const fileBuffer = await getRecording({ recordingId });
      setAudioUrl(fileBuffer);
    } catch (e) {
      alert("Could not fetch audio");
    } finally {
      setIsLoading(false);
    }
  });

  const audioSource = useMemo(() => {
    return audioUrl
      ? URL.createObjectURL(
          audioUrl instanceof Blob
            ? audioUrl
            : new Blob([audioUrl], { type: "audio/mpeg" }),
        )
      : undefined;
  }, [audioUrl]);

  const onPlay = useStableCallback(() => setIsPlaying(true));
  const onPause = useStableCallback(() => setIsPlaying(false));

  return {
    audioUrl,
    isLoading,
    isPlaying,
    audioRef,
    audioSource,
    fetchAudio,
    onPlay,
    onPause,
  };
}

export default function RecordingItem({ recording }: { recording: Recording }) {
  const { createdAt } = recording;

  const {
    isPlaying,
    audioUrl,
    fetchAudio,
    audioRef,
    audioSource,
    onPlay,
    onPause,
  } = useAudio({
    recordingId: recording.id,
  });

  return (
    <div className="flex gap-2 justify-center">
      <button
        className="cursor-pointer"
        onClick={async () => {
          if (!audioUrl) {
            await fetchAudio();
          }
          if (!isPlaying) {
            audioRef.current?.play();
          } else {
            audioRef.current?.pause();
          }
        }}
      >
        {isPlaying ? <PauseCircle /> : <PlayCircle />}
      </button>

      <span className="flex align-middle justify-center">
        {createdAt?.toDateString()}
      </span>

      <audio
        ref={audioRef}
        onPlay={onPlay}
        onPause={onPause}
        src={audioSource}
      />
    </div>
  );
}
