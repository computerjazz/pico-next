"use client";

import { getRecording } from "@/app/actions/getRecording";
import { Recording } from "@/db/schema";
import { useRef, useState } from "react";

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

export default function RecordingItem({ recording }: { recording: Recording }) {
  const [audioUrl, setAudioUrl] = useState<Buffer<ArrayBuffer> | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const { id, createdAt } = recording;

  const audioRef = useRef<HTMLAudioElement>(null);
  async function fetchAudio() {
    setLoading(true);
    try {
      const fileBuffer = await getRecording({ recordingId: id });
      setAudioUrl(fileBuffer);
    } catch (e) {
      alert("Could not fetch audio");
    }
    setLoading(false);
  }

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
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        src={
          audioUrl
            ? URL.createObjectURL(
                audioUrl instanceof Blob
                  ? audioUrl
                  : new Blob([audioUrl], { type: "audio/mpeg" }),
              )
            : undefined
        }
      />
    </div>
  );
}
