import { db } from "@/db";
import { notFound, unauthorized } from "next/navigation";
import { auth } from "@/auth";
import PageHeader from "@/app/components/PageHeader";
import { RecordingItemSingle } from "../../[id]/RecordingItem";

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const recordingId = (await params).id;
  const session = await auth();

  const recording = await db.query.recordings.findFirst({
    where: (d, { eq }) => eq(d.id, recordingId),
    with: {
      device: true,
    },
  });

  const isOwner = recording?.device?.userId === session?.user?.id;

  const canView = isOwner || recording?.isShared;

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
