"use client";

import { getRecording } from "@/app/actions/getRecording";
import { AudioProvider, useAudioContext } from "@/app/components/AudioProvider";
import EllipsesCircle from "@/app/components/icons/EllipsesCircle";
import PauseCircle from "@/app/components/icons/PauseCircle";
import PlayCircle from "@/app/components/icons/PlayCircle";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Recording } from "@/db/schema";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import Trash from "@/app/components/icons/Trash";
import { deleteRecording } from "@/app/actions/deleteRecording";
import ArrowDownTray from "@/app/components/icons/ArrowDownTray";
import Share from "@/app/components/icons/Share";
import { shareRecording } from "@/app/actions/shareRecording";

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

type Props = {
  recording: Recording;
  className?: string;
  enabledActions?: ("delete" | "share" | "download")[];
};

export default function RecordingItem({
  recording,
  enabledActions = ["delete", "share", "download"],
}: Props) {
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

  const isDevice = recording.source === "shortwave-device";

  async function onDeletePress() {
    if (window.confirm("Are you sure you want to delete this recording?")) {
      await deleteRecording({ recordingId: recording.id });
    }
  }

  async function onSharePress() {
    await shareRecording({ recordingId: recording.id });
    // Copy a public (shared) URL to clipboard for this recording
    // You may want to update this URL scheme to your production host as needed
    // Example: `${window.location.origin}/shortwave/recording/${recording.id}`

    const url = `${window.location.origin}/shortwave/recording/${recording.id}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    } catch (err) {
      alert("Failed to copy link to clipboard.");
    }
  }

  async function onDownloadPress() {
    // Implement download functionality for the audio file
    let source = audioSource;
    if (!source) {
      // Try to fetch audio if not available yet
      source = await fetchAudio();
    }
    if (!source) {
      alert("Audio not available to download.");
      return;
    }
    // Fetch the audio blob if source is object url
    let blob: Blob;
    if (typeof source === "string" && source.startsWith("blob:")) {
      // If the source is a Blob URL, fetch it as a blob
      const res = await fetch(source);
      blob = await res.blob();
    } else if (typeof source === "string" && /^https?:/.test(source)) {
      // If the source is an HTTP(s) url, fetch it as a blob
      const res = await fetch(source);
      blob = await res.blob();
    } else {
      alert("Unable to download audio.");
      return;
    }

    // Prepare download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recording-${recording.id}.mp3`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  const PlayPauseIcon = isLoading
    ? EllipsesCircle
    : isPlaying
      ? PauseCircle
      : PlayCircle;
  return (
    <div
      className={`flex relative ${isDevice ? "self-start text-start items-start" : "self-end text-end items-end"}`}
    >
      <div className="absolute z-0 flex align-middle top-0 bottom-0 left-0 right-0 items-center justify-end p-2 gap-8">
        {enabledActions.includes("delete") && (
          <button className="cursor-pointer" onClick={onDeletePress}>
            <Trash />
          </button>
        )}
        {enabledActions.includes("download") && (
          <button className="cursor-pointer" onClick={onDownloadPress}>
            <ArrowDownTray />
          </button>
        )}
        {enabledActions.includes("share") && (
          <button className="cursor-pointer" onClick={onSharePress}>
            <Share />
          </button>
        )}
      </div>
      <motion.div
        className={`flex flex-col gap-2 p-4 rounded-md ${isDevice ? "bg-muted-foreground text-accent-foreground" : "bg-muted-surface text-muted-foreground"} z-10 `}
        drag="x"
        dragConstraints={{ right: 0, left: -200 }}
        dragElastic={0.05}
      >
        <div className="flex flex-row gap-2 text-xs font-bold opacity-70">
          <span className="flex align-middle">
            {createdAt && (
              <div>
                <span>{createdAt.toDateString()} </span>
                <span>
                  {createdAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
            {durationMillis && (
              <>
                <span className="mx-2">•</span>
                <span>
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
        <div
          className={`flex flex-1 flex-row gap-2 justify-start self-start ml-4 py-2 text-sm wrap-break-words`}
        >
          <div>
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
                  if (
                    err instanceof DOMException &&
                    err.name !== "AbortError"
                  ) {
                    console.error(err);
                  }
                }
              }}
            >
              <PlayPauseIcon className="size-10" />
            </button>
          </div>
          <div className="flex flex-1 items-center text-start">
            <span>{recording.transcript}</span>
          </div>
        </div>

        <audio ref={audioRef} onPlay={onPlay} onPause={onPause} />
      </motion.div>
    </div>
  );
}

export const RecordingItemSingle = (props: Props) => {
  return (
    <AudioProvider>
      <RecordingItem {...props} />
    </AudioProvider>
  );
};
