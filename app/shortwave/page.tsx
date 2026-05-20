import { db } from "@/db";
import PageHeader from "../components/PageHeader";
import Image from "next/image";
import RecordingsChat from "../components/RecordingsChat";
import HeroImage from "../components/HeroImage";

export default async function ShortwaveLandingPage() {
  const recordings = await db.query.recordings.findMany({
    where: (t, { and, eq, isNull }) =>
      and(eq(t.deviceId, "sh0rtwave-alpha-dev"), isNull(t.deletedAt)),
  });

  return (
    <div className="min-h-screen">
      <main className="flex flex-col">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent mb-2">sh0rtwave</h1>
          </div>
        </PageHeader>
        <HeroImage src="/hero-shortwave.jpg" alt="sh0rtwave hero" />
        <div className="flex flex-col items-center">
          <div className="gap-4 max-w-lg flex flex-col p-4">
            <h1 className="text-2xl font-semibold whitespace-pre-line">
              {`Trade audio messages.\nNo screens attached.`}
            </h1>

            <p>
              {`Press and hold the big button on top of the little wooden box to send a voice message to a
              parent or friend. If the "answering machine" light on top is
              blinking, they've sent you a message back! Give the button a quick tap to listen.`}
            </p>
            <p>
              {`Log into your account to view all of your messages and record and send new answering machine messages back:`}
            </p>
            <div className="max-h-96 flex">
              <RecordingsChat recordings={recordings} autoScroll={false} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
