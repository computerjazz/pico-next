import { db } from "@/db";
import PageHeader from "../components/PageHeader";
import Image from "next/image";
import RecordingsChat from "../components/RecordingsChat";

export default async function ShortwaveLandingPage() {
  const recordings = await db.query.recordings.findMany({
    where: (t, { eq }) => eq(t.deviceId, "sh0rtwave-alpha-dev"),
  });

  return (
    <div className="min-h-screen">
      <main className="flex flex-col">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent mb-2">sh0rtwave</h1>
          </div>
        </PageHeader>
        <Image
          width={1024}
          height={128}
          src="/hero-shortwave.jpg"
          alt="Shortwave Hero"
          className="w-full aspect-2.5/1 object-cover"
          priority
        />
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
