import { db } from "@/db";
import { notFound } from "next/navigation";
import VolumeInput from "./VolumeInput";
import DeviceNameInput from "../../components/DeviceNameInput";
import { auth } from "@/auth";
import ClaimButton from "../../components/ClaimButton";
import { RecordingsList } from "./RecordingsList";
import { Device, devices, recordings } from "@/db/schema";
import { eq, isNull, and, asc } from "drizzle-orm";
import RecordingButton from "./RecordingButton";
import PageHeader from "@/app/components/PageHeader";
import PushSubscriber from "@/app/components/PushSubscriber";
import RecordingListFrame from "@/app/components/RecordingListFrame";
import RecordingsChat from "@/app/components/RecordingsChat";

function DeviceStatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex flex-row font-semibold text-muted-foreground text-xs gap-2">
        <div>{label}</div>
        <div>{value}</div>
      </div>
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

  const device = await db.query.devices.findFirst({
    where: (d, { eq }) => eq(d.deviceId, deviceId),
  });

  const _recordingItems = await db
    .select({ recordings })
    .from(recordings)
    .innerJoin(devices, eq(recordings.deviceId, devices.deviceId))
    .where(
      and(
        eq(recordings.deviceId, deviceId),
        eq(devices.userId, session?.user?.id ?? "__NO_USER__"),
        isNull(recordings.deletedAt),
      ),
    )
    .orderBy(asc(recordings.createdAt));

  const recordingItems = _recordingItems.map((ri) => ri.recordings);

  if (!device) {
    notFound();
  }

  const deviceUserId = device.userId;
  const sessionUserId = session?.user?.id;
  const isDeviceOwner = sessionUserId && deviceUserId === sessionUserId;

  return (
    <div className="flex flex-col h-svh">
      <PushSubscriber
        shouldPrompt={!!isDeviceOwner}
        deviceId={device.deviceId}
        scope="/shortwave/"
      />
      <PageHeader>
        <div className="flex flex-col justify-center">
          <div className="flex flex-row gap-4">
            <DeviceNameInput device={device} disabled={!isDeviceOwner} />
            <ClaimButton device={device} />
          </div>
          <div className="space-y-2 text-sm mt-4">
            {device.type === "shortwave" ? (
              <div className="flex flex-row gap-4">
                <DeviceStatRow label="Volume:" value={`${device.volume}%`} />
                <VolumeInput device={device} disabled={!isDeviceOwner} />
              </div>
            ) : (
              <DeviceDetails device={device} />
            )}
          </div>
        </div>
      </PageHeader>

      {isDeviceOwner && (
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
