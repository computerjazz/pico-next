"use client";

import { getRecording } from "@/app/actions/getRecording";
import { useAudioContext } from "@/app/components/AudioProvider";
import EllipsesCircle from "@/app/components/icons/EllipsesCircle";
import PauseCircle from "@/app/components/icons/PauseCircle";
import PlayCircle from "@/app/components/icons/PlayCircle";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Recording } from "@/db/schema";
import { useEffect, useRef, useState } from "react";

function useAudio({ recordingId }: { recordingId: string }) {
  const [audioSource, setAudioSource] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { onPlay, onRef } = useAudioContext();

  useEffect(() => {
    onRef({ id: recordingId, ref: audioRef });
  }, [onRef, recordingId]);

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

  const _onPlay = useStableCallback(() => {
    onPlay({ id: recordingId });
    setIsPlaying(true);
  });
  const _onPause = useStableCallback(() => setIsPlaying(false));

  return {
    isLoading,
    isPlaying,
    audioRef,
    audioSource,
    fetchAudio,
    onPlay: _onPlay,
    onPause: _onPause,
  };
}

export default function RecordingItem({
  recording,
  className,
}: {
  recording: Recording;
  className?: string;
}) {
  const { createdAt, durationMillis } = recording;

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
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-row gap-2 items-center">
        <button
          className="cursor-pointer"
          onClick={async () => {
            try {
              if (!audioSource) {
                await fetchAudio();
              }
              if (isPlaying) {
                audioRef.current?.pause();
              } else {
                await audioRef.current?.play();
              }
            } catch (err) {
              if (err instanceof DOMException && err.name !== "AbortError") {
                console.error(err);
              }
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

        <span className="flex align-middle">
          {createdAt && (
            <div>
              <span>{createdAt.toDateString()} </span>
              <span className="text-gray-600">
                {createdAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
          {durationMillis && (
            <>
              <span className="mx-2 text-gray-600">•</span>
              <span className="text-gray-600">
                {(() => {
                  const ms = parseInt(durationMillis, 10);
                  if (isNaN(ms)) return null;
                  const totalSeconds = Math.floor(ms / 1000);
                  const minutes = Math.floor(totalSeconds / 60);
                  const seconds = totalSeconds % 60;
                  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
                })()}
              </span>
            </>
          )}
        </span>
      </div>
      {recording.transcript && (
        <div className="flex items-center ml-4 py-2 text-sm text-gray-400 max-w-xs break-words">
          <span>{recording.transcript}</span>
        </div>
      )}

      <audio ref={audioRef} onPlay={onPlay} onPause={onPause} />
    </div>
  );
}
