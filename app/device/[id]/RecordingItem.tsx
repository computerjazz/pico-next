"use client";

import { getRecording } from "@/app/actions/getRecording";
import { Recording } from "@/db/schema";
import { useState } from "react";

export default function RecordingItem({ recording }: { recording: Recording }) {
  const [audioUrl, setAudioUrl] = useState<Buffer<ArrayBuffer> | null>(null);
  const [loading, setLoading] = useState(false);
  const { id, createdAt } = recording;
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
    <div>
      {audioUrl ? (
        <audio
          controls
          src={
            // No, <audio> src cannot be a Buffer or ArrayBuffer.
            // It needs to be a string: either an ObjectURL or a direct URL.
            // So you should convert Buffer/ArrayBuffer to a Blob, then to an ObjectURL:
            audioUrl
              ? URL.createObjectURL(
                  audioUrl instanceof Blob
                    ? audioUrl
                    : new Blob([audioUrl], { type: "audio/mpeg" }),
                )
              : undefined
          }
        />
      ) : (
        <button onClick={fetchAudio} disabled={loading}>
          {loading ? "Loading..." : "Play Recording"}
        </button>
      )}
      <span>{createdAt?.toDateString()}</span>
    </div>
  );
}
