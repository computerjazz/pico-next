"use client";
import { Recording } from "@/db/schema";
import { RecordingsList } from "../shortwave/[id]/RecordingsList";
import RecordingListFrame from "./RecordingListFrame";
import { useRef, useState } from "react";

function RecordingsChat({
  recordings,
  autoScroll,
}: {
  recordings: Recording[];
  autoScroll?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  return (
    <div className="flex flex-1 flex-col overflow-y-hidden relative">
      <div
        ref={scrollRef}
        onScroll={() => {
          const containerEl = scrollRef.current;
          if (!containerEl) return;
          const _isScrolledUp =
            containerEl.scrollHeight -
              containerEl.scrollTop -
              containerEl.clientHeight >
            1;
          if (isScrolledUp !== _isScrolledUp) {
            setIsScrolledUp(_isScrolledUp);
          }
        }}
        className="overflow-y-scroll relative"
      >
        <div className="max-w-md mx-auto flex flex-col flex-1 min-h-0 px-4">
          <div className="flex flex-1">
            <RecordingsList
              recordings={recordings}
              autoScroll={autoScroll}
              isScrolledUp={isScrolledUp}
            />
          </div>
        </div>
      </div>
      <RecordingListFrame />
    </div>
  );
}

export default RecordingsChat;
