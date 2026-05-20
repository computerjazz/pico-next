import { Recording } from "@/db/schema";
import { RecordingsList } from "../shortwave/[id]/RecordingsList";
import RecordingListFrame from "./RecordingListFrame";

function RecordingsChat({ recordings }: { recordings: Recording[] }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-hidden relative">
      <div className="overflow-y-scroll relative">
        <div className="max-w-md mx-auto flex flex-col flex-1 min-h-0 px-4">
          <div className="flex flex-1">
            <RecordingsList recordings={recordings} />
          </div>
        </div>
      </div>
      <RecordingListFrame />
    </div>
  );
}

export default RecordingsChat;
