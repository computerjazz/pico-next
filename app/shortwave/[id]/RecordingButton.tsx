"use client";
import { leaveMessage } from "@/app/actions/leaveMessage";
import { useRef, useState } from "react";
import { toast } from "sonner";

function haptic(duration = 30) {
  // Subtle haptic feedback when recording begins
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    // Try for a subtle, brief vibration pattern
    try {
      navigator.vibrate(duration);
    } catch (err) {
      // Not critical, ignore failure
      console.log("vibrate err", err);
    }
  }
}

function RecordingButton({ deviceId }: { deviceId: string }) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Request mic, set up MediaRecorder
  async function startRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioPriority = ["audio/mp3", "audio/webm", "audio/ogg"];
      const mimeType = audioPriority.find((mt) =>
        MediaRecorder.isTypeSupported(mt),
      );

      if (!mimeType) {
        throw new Error("No supported audio format for recording");
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const form = new FormData();
        const ext = mimeType.split("/")[1];
        const filename = `recording-${deviceId}-${new Date().toISOString()}.${ext}`;
        form.append("audio", blob, filename);
        form.append("mimetype", mimeType);

        await leaveMessage({ form, deviceId });
      };
      mediaRecorder.start();

      setIsRecording(true);
    } catch (e) {
      toast.error(`Could not start recording`);
      setIsRecording(false);
    }
  }

  function stopRecording() {
    setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
    }
  }

  return (
    <div
      className="flex flex-col items-center gap-2"
      style={{
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
      onContextMenu={(e) => e.preventDefault()}
      onSelect={(e) => e.preventDefault()}
      tabIndex={-1}
      draggable={false}
    >
      <div className="relative">
        <button
          onPointerDown={() => {
            console.log("haptic!!!");
            haptic();
            startRecording();
          }}
          onTouchEnd={stopRecording}
          onTouchCancel={stopRecording}
          onPointerCancel={stopRecording}
          onMouseDown={startRecording}
          onMouseLeave={stopRecording}
          onMouseUp={stopRecording}
          onContextMenu={(e) => e.preventDefault()}
          className={`${isRecording ? "border-accent" : "border-accent-surface"} flex border-4 rounded-full cursor-pointer w-24 h-24 select-none active:outline-none focus:outline-none overflow-hidden transition-transform duration-150 hover:scale-105`}
          tabIndex={0}
          draggable={false}
          style={{
            WebkitUserSelect: "none",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div
            className={`flex flex-1 m-1 pointer-none:*: text-accent-foreground select-none ${isRecording ? "bg-accent" : "bg-accent-surface"} rounded-full items-center`}
          >
            <span className="select-none text-xs">Leave a message</span>
          </div>
        </button>
        {isRecording && (
          <div
            className="absolute top-0 bottom-0 left-0 right-0 flex -ml-12 pointer-events-none"
            aria-label="Recording"
          >
            <div className="w-6 h-6 rounded-full bg-accent self-center"></div>
          </div>
        )}
      </div>
      <div
        className={`
          absolute top-0 bottom-0 left-0 right-0 bg-accent pointer-events-none z-1000
          ${isRecording ? "animate-pulse-opacity" : "opacity-0 transition-opacity duration-300"}
        `}
        style={{
          // Remove transition if animating, otherwise do a fade out.
          transition: isRecording ? undefined : "opacity 0.3s",
        }}
      ></div>
    </div>
  );
}

export default RecordingButton;
