import React, { useContext, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";

type OnRefParams = {
  ref: React.RefObject<HTMLAudioElement | null>;
  id: string;
};

type AudioPlayerContextValue = {
  onPlay: (params: { id: string }) => void;
  onRef: (params: OnRefParams) => void;
};

const AudioContext = React.createContext<AudioPlayerContextValue | undefined>(
  undefined,
);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [audioRefs, setAudioRefs] = useState(
    new Map<string, React.RefObject<HTMLAudioElement | null>>(),
  );

  const onPlay = useStableCallback(({ id }: { id: string }) => {
    [...audioRefs.entries()].forEach(([recordingId, ref]) => {
      if (recordingId !== id) ref.current?.pause();
    });
  });

  const onRef = useStableCallback(({ id, ref }: OnRefParams) => {
    setAudioRefs((prev) => {
      const updated = new Map(prev);
      updated.set(id, ref);
      return updated;
    });
  });

  return (
    <AudioContext.Provider
      value={{
        onPlay,
        onRef,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudioContext() {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error(
      "useAudioContext() must be called within an AudioProvider!",
    );
  }
  return ctx;
}
