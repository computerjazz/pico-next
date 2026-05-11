"use client";

import { getRecording } from "@/app/actions/getRecording";
import EllipsesCircle from "@/app/components/icons/EllipsesCircle";
import PauseCircle from "@/app/components/icons/PauseCircle";
import PlayCircle from "@/app/components/icons/PlayCircle";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Recording } from "@/db/schema";
import { useMemo, useRef, useState } from "react";

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
    isLoading,
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
        {isLoading ? (
          <EllipsesCircle />
        ) : isPlaying ? (
          <PauseCircle />
        ) : (
          <PlayCircle />
        )}
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
