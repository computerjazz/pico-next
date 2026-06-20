import { db } from "@/db";
import { notFound, unauthorized } from "next/navigation";
import { auth } from "@/auth";
import PageHeader from "@/app/components/PageHeader";
import { RecordingItemSingle } from "../../[id]/RecordingItem";
import { Metadata } from "next";
import { formatAudioDuration } from "@/lib/utils";
import { cache } from "react";
import { getDeviceAccess } from "@/lib/access";

type Props = {
  params: Promise<{ id: string }>;
};

const getRecording = cache(async ({ recordingId }: { recordingId: string }) => {
  const recording = await db.query.recordings.findFirst({
    where: (d, { eq }) => eq(d.id, recordingId),
    with: {
      device: true,
    },
  });
  return recording;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const recordingId = (await params).id;

  const recording = await getRecording({ recordingId });
  return {
    title: `Recording from ${recording?.device?.name || "sh0rtwave"}`,
    description: `${recording?.transcript} • ${formatAudioDuration({
      durationMillis: recording?.durationMillis || "",
    })}`,
    openGraph: {
      images: ["/img/logo-shortwave.png"],
    },
  };
}

export default async function RecordingPage({ params }: Props) {
  const recordingId = (await params).id;
  const session = await auth();
  const sessionUserId = session?.user?.id;

  const recording = await getRecording({ recordingId });

  const { isOwner, isShare } = await getDeviceAccess({
    userId: sessionUserId,
    deviceId: recording?.device?.deviceId,
    device: recording?.device,
  });

  const canView = isOwner || isShare || recording?.isShared;

  if (!recording) {
    notFound();
  }

  if (!canView) {
    unauthorized();
  }

  return (
    <div className="flex flex-col h-svh">
      <PageHeader>
        <div className="flex flex-col justify-center">
          <div className="flex flex-col gap-4 items-center justify-center">
            <h1 className="flex text-2xl font-bold">
              {recording.device?.name || "sh0rtwave"}
            </h1>
          </div>
        </div>
      </PageHeader>
      <div className="flex items-center justify-center p-4">
        <div className="max-w-lg">
          <RecordingItemSingle
            recording={recording}
            enabledActions={["download"]}
          />
        </div>
      </div>
    </div>
  );
}
