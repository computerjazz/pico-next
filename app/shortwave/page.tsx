import { db } from "@/db";
import PageHeader from "../components/PageHeader";
import RecordingsChat from "../components/RecordingsChat";
import HeroImage from "../components/HeroImage";
import { asc } from "drizzle-orm";
import { recordings } from "@/db/schema";
import ShortwaveSetupInstructions from "./SetupInstructions";

export default async function ShortwaveLandingPage() {
  const recordingItems = await db.query.recordings.findMany({
    where: (t, { and, eq, isNull }) =>
      and(eq(t.deviceId, "sh0rtwave-alpha-dev"), isNull(t.deletedAt)),
    orderBy: asc(recordings.createdAt),
  });

  return (
    <div className="min-h-screen">
      <main className="flex flex-col">
        <PageHeader title="sh0rtwave" />
        <HeroImage
          src="/img/hero-shortwave.jpg"
          alt="sh0rtwave hero"
          text={`Trade voice messages, no screens attached`}
        />
        <div className="flex flex-col items-center">
          <div className="gap-4 max-w-lg flex flex-col p-4">
            <p>
              {`Press the big button on top to send a voice message to a
              family member or a friend. When the "answering machine" light starts
              to blink, they've sent you a message back!`}
            </p>
            <p>
              {`Parents—listen to all of your loved ones' transcribed recordings and send new answering machine messages from the app.`}
            </p>
            <div className="max-h-96 flex">
              <RecordingsChat recordings={recordingItems} autoScroll={false} />
            </div>
            <ShortwaveSetupInstructions />
          </div>
        </div>
      </main>
    </div>
  );
}
