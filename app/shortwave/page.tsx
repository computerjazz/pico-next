import { db } from "@/db";
import PageHeader from "../components/PageHeader";
import RecordingsChat from "../components/RecordingsChat";
import HeroImage from "../components/HeroImage";
import { asc } from "drizzle-orm";
import { recordings } from "@/db/schema";

export default async function ShortwaveLandingPage() {
  const recordingItems = await db.query.recordings.findMany({
    where: (t, { and, eq, isNull }) =>
      and(eq(t.deviceId, "sh0rtwave-alpha-dev"), isNull(t.deletedAt)),
    orderBy: asc(recordings.createdAt),
  });

  return (
    <div className="min-h-screen">
      <main className="flex flex-col">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent mb-2">sh0rtwave</h1>
          </div>
        </PageHeader>
        <HeroImage
          src="/img/hero-shortwave.jpg"
          alt="sh0rtwave hero"
          text={`Trade voice messages, no screens attached`}
        />
        <div className="flex flex-col items-center">
          <div className="gap-4 max-w-lg flex flex-col p-4">
            <p>
              {`Press the big button on top of the little wooden box to send a voice message to a
              parent or a friend. When the "answering machine" light starts
              to blink, they've sent you a message back!`}
            </p>
            <p>
              {`Log into your account to listen to all of your messages and send messages back:`}
            </p>
            <div className="max-h-96 flex">
              <RecordingsChat recordings={recordingItems} autoScroll={false} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
