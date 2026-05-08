"use client";

import { generateToken } from "@/app/actions/generateToken";
import { Recording } from "@/db/schema";
import { useState } from "react";

export default function RecordingItem({ recording }: { recording: Recording }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { id, createdAt } = recording;
  async function fetchAudio() {
    setLoading(true);
    try {
      // Fetch auth token/session for header from current user via /api/auth/session if needed
      // For demo: fetch as-is, assuming the user's session cookie is sent
      const res = await fetch(`/api/recording/${id}`, {
        headers: {
          // Add any required headers if needed, e.g. "Authorization"
          authorization: await generateToken({ scope: "" }),
        },
        credentials: "include", // send cookies
      });
      if (!res.ok) throw new Error("Failed to fetch audio");
      const { filePath } = await res.json();
      setAudioUrl(filePath);
    } catch (e) {
      alert("Could not fetch audio");
    }
    setLoading(false);
  }

  return (
    <div>
      {audioUrl ? (
        <audio controls src={audioUrl} />
      ) : (
        <button onClick={fetchAudio} disabled={loading}>
          {loading ? "Loading..." : "Play Recording"}
        </button>
      )}
      <span>{recording.createdAt?.toDateString()}</span>
    </div>
  );
}
