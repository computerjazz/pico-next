import { db } from "@/db";
import { notFound } from "next/navigation";
import VolumeInput from "./VolumeInput";
import DeviceNameInput from "./DeviceNameInput";
import { auth } from "@/auth";
import ClaimButton from "./ClaimButton";
import ProfileSignInButton from "@/app/components/ProfileSignInButton";
import { RecordingsList } from "./RecordingsList";

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

  const recordings = await db.query.recordings.findMany({
    where: (t, { and, isNull, eq }) =>
      and(eq(t.deviceId, deviceId), isNull(t.deletedAt)),
    orderBy: (t, { desc }) => desc(t.createdAt),
  });

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
            <DeviceStatRow label="Volume:" value={`${device.volume}%`} />
          )}
        </div>
        {device.type === "shortwave" && (
          <>
            <VolumeInput device={device} disabled={!isDeviceOwner} />

            {isDeviceOwner && (
              <>
                <DeviceStatRow
                  label="Recordings:"
                  value={String(recordings.length)}
                />
                <RecordingsList recordings={recordings} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
