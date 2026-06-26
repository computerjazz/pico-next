import { db } from "@/db";
import { notFound } from "next/navigation";
import VolumeInput from "./VolumeInput";
import { auth } from "@/auth";
import ClaimButton from "../../components/ClaimButton";
import { Device, devices, recordings } from "@/db/schema";
import { eq, isNull, and, asc } from "drizzle-orm";
import RecordingButton from "./RecordingButton";
import PageHeader from "@/app/components/PageHeader";
import PushSubscriber from "@/app/components/PushSubscriber";
import RecordingsChat from "@/app/components/RecordingsChat";
import DeviceHeader from "@/app/components/DeviceHeader";
import { getDeviceAccess } from "@/lib/access";

function DeviceStatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-row font-semibold text-muted-foreground text-xs gap-2">
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function DeviceDetails({ device }: { device: Device }) {
  return (
    <>
      <DeviceStatRow label="Device ID:" value={device.deviceId} />
      <DeviceStatRow label="Type:" value={device.type} />
      {device.firmwareVersion && (
        <DeviceStatRow
          label="Firmware Version:"
          value={device.firmwareVersion}
        />
      )}
    </>
  );
}

export default async function DevicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const deviceId = (await params).id;
  const session = await auth();
  const sessionUserId = session?.user?.id;

  const device = await db.query.devices.findFirst({
    where: (d, { eq }) => eq(d.deviceId, deviceId),
  });

  if (!device) {
    notFound();
  }

  const { isOwner, isShare } = await getDeviceAccess({
    deviceId: device.deviceId,
    userId: sessionUserId,
  });
  const canViewRecordings = isOwner || isShare;

  const _recordingItems = canViewRecordings
    ? await db
        .select({ recordings })
        .from(recordings)
        .innerJoin(devices, eq(recordings.deviceId, devices.deviceId))
        .where(
          and(eq(recordings.deviceId, deviceId), isNull(recordings.deletedAt)),
        )
        .orderBy(asc(recordings.createdAt))
    : [];

  const recordingItems = _recordingItems.map((ri) => ri.recordings);

  return (
    <div className="flex flex-col h-svh">
      <PushSubscriber
        shouldPrompt={!!isOwner}
        deviceId={device.deviceId}
        scope="/shortwave/"
      />
      <PageHeader>
        <div className="flex flex-col">
          <div className="flex flex-row gap-4">
            <DeviceHeader device={device} disabled={!isOwner} />
            <ClaimButton device={device} />
          </div>
          <div className="space-y-2 text-sm mt-4">
            {device.type === "shortwave" ? (
              <div className="flex flex-row gap-4">
                <VolumeInput device={device} disabled={!canViewRecordings} />
              </div>
            ) : (
              <DeviceDetails device={device} />
            )}
          </div>
        </div>
      </PageHeader>

      {canViewRecordings && (
        <>
          <RecordingsChat recordings={recordingItems} />
          <div className="p-4">
            <RecordingButton deviceId={deviceId} />
          </div>
        </>
      )}
    </div>
  );
}
