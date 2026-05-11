"use client";

import { getRecording } from "@/app/actions/getRecording";
import EllipsesCircle from "@/app/components/icons/EllipsesCircle";
import PauseCircle from "@/app/components/icons/PauseCircle";
import PlayCircle from "@/app/components/icons/PlayCircle";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Recording } from "@/db/schema";
import { useRef, useState } from "react";

function useAudio({ recordingId }: { recordingId: string }) {
  const [audioSource, setAudioSource] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const fetchAudio = useStableCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const fileBuffer = await getRecording({ recordingId });
      const _audioSrc = URL.createObjectURL(
        fileBuffer instanceof Blob
          ? fileBuffer
          : new Blob([fileBuffer], { type: "audio/mpeg" }),
      );
      if (audioRef.current) {
        audioRef.current?.pause();
        audioRef.current.src = _audioSrc;
        audioRef.current.load();
      }
      setAudioSource(_audioSrc);
      return _audioSrc;
    } catch (e) {
      alert("Could not fetch audio");
    } finally {
      setIsLoading(false);
    }
  });

  const onPlay = useStableCallback(() => setIsPlaying(true));
  const onPause = useStableCallback(() => setIsPlaying(false));

  return {
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
          if (!audioSource) {
            await fetchAudio();
          }
          if (!isPlaying) {
            await audioRef.current?.play();
          } else {
            await audioRef.current?.pause();
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
