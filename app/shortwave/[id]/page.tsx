import { db } from "@/db";
import { notFound } from "next/navigation";
import VolumeInput from "./VolumeInput";
import { auth } from "@/auth";
import { Device, devices, recordings } from "@/db/schema";
import { eq, isNull, and, asc } from "drizzle-orm";
import RecordingButton from "./RecordingButton";
import PageHeader from "@/app/components/PageHeader";
import PushSubscriber from "@/app/components/PushSubscriber";
import RecordingsChat from "@/app/components/RecordingsChat";
import DeviceHeader from "@/app/components/DeviceHeader";
import { getDeviceAccess } from "@/lib/access";
import Welcome from "./Welcome";

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
  const isClaimed = !!device.userId;
  const isLoggedIn = !!session?.user?.id;

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
          </div>
          <div className="space-y-2 text-sm mt-4">
            {canViewRecordings ? (
              <div className="flex flex-row gap-4">
                <VolumeInput device={device} disabled={!canViewRecordings} />
              </div>
            ) : (
              <DeviceDetails device={device} />
            )}
          </div>
        </div>
      </PageHeader>

      {!isClaimed && <Welcome isLoggedIn={isLoggedIn} device={device} />}

      {canViewRecordings && (
        <>
          {!recordingItems.length && (
            <div className="p-4 max-w-2xl text-center flex self-center flex-col gap-4">
              <p>
                Try recording your first message on your device, or leave an
                answering machine message using the button below!
              </p>
              <div className="text-left">
                <h2 className="font-bold">Device setup:</h2>
                <ul>
                  <li>• Plug in your sh0rtwave (the red light should pulse)</li>
                  <li>
                    • Connect to the <i>sh0rtwave-setup</i> wifi network
                  </li>
                  <li>• Select your wifi network and enter your password</li>
                  <li>
                    • When the red light should stop pulsing, the device has
                    successfully connected
                  </li>
                  <li>• Record your first message!</li>
                </ul>
              </div>
            </div>
          )}
          <RecordingsChat recordings={recordingItems} />
          <div className="p-4">
            <RecordingButton deviceId={deviceId} />
          </div>
        </>
      )}
    </div>
  );
}
