import { db } from "@/db";
import { notFound } from "next/navigation";
import VolumeInput from "./VolumeInput";
import DeviceNameInput from "./DeviceNameInput";
import { auth } from "@/auth";
import ClaimButton from "./ClaimButton";
import ProfileSignInButton from "@/app/components/ProfileSignInButton";
import { RecordingsList } from "./RecordingsList";
import { devices, recordings } from "@/db/schema";
import { eq, isNull, and, desc } from "drizzle-orm";
import RecordingButton from "./RecordingButton";

function DeviceStatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold">{label}</span> {value}
    </div>
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
    .orderBy(desc(recordings.createdAt));

  const recordingItems = _recordingItems.map((ri) => ri.recordings);

  if (!device) {
    notFound();
  }

  const deviceUserId = device?.userId;
  const sessionUserId = session?.user?.id;
  const isDeviceOwner = sessionUserId && deviceUserId === sessionUserId;

  return (
    <div>
      <div className="p-4">
        <div className="flex justify-end">
          <ProfileSignInButton />
        </div>
      </div>
      <div className="mx-auto max-w-xl p-6 space-y-8">
        <h1 className="text-2xl font-bold mb-2">
          <ClaimButton device={device} />
          <DeviceNameInput device={device} disabled={!isDeviceOwner} />
        </h1>
        <div className="space-y-2 text-sm">
          <DeviceStatRow label="Device ID:" value={device.deviceId} />
          <DeviceStatRow label="Type:" value={device.type} />
          {device.firmwareVersion && (
            <DeviceStatRow
              label="Firmware Version:"
              value={device.firmwareVersion}
            />
          )}
          {device.type === "shortwave" && (
            <>
              <div className="flex flex-row gap-4">
                <DeviceStatRow label="Volume:" value={`${device.volume}%`} />
                <VolumeInput device={device} disabled={!isDeviceOwner} />
              </div>
              <DeviceStatRow
                label="Recordings:"
                value={String(recordingItems.length)}
              />
            </>
          )}
        </div>
        {device.type === "shortwave" && isDeviceOwner && (
          <>
            <div className="fixed bottom-2 right-4 z-50">
              <RecordingButton deviceId={deviceId} />
            </div>
            <RecordingsList recordings={recordingItems} />
          </>
        )}
      </div>
    </div>
  );
}
