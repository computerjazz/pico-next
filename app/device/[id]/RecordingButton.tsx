"use client";
import { leaveMessage } from "@/app/actions/leaveMessage";
import { useRef, useState } from "react";
import { motion } from "motion/react";

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
      alert(`Could not start recording: ${e}`);
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
    <motion.div className="flex flex-col items-center gap-2 transition-transform duration-150 hover:scale-105">
      <button
        onPointerDown={startRecording}
        onPointerUp={stopRecording}
        className={`${isRecording ? "bg-accent" : "bg-muted-foreground"} border-0 outline-0 rounded-full cursor-pointer w-24 h-24`}
        aria-label="Record"
      >
        <div className="pointer-none:*: text-accent-foreground">
          <span>Leave a message</span>
        </div>
      </button>
    </motion.div>
  );
}

export default RecordingButton;
