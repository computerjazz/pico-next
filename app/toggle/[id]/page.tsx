import { db } from "@/db";
import { notFound } from "next/navigation";
import DeviceNameInput from "../../components/DeviceNameInput";
import { auth } from "@/auth";
import ClaimButton from "../../components/ClaimButton";
import { Device } from "@/db/schema";
import PageHeader from "@/app/components/PageHeader";
import Scoreboard from "../group/[groupId]/Scoreboard";

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

function formatMinutesAgo({ date }: { date: Date }) {
  return `${Math.floor(
    (Date.now() - new Date(date).getTime()) / 60000,
  )} minutes ago`;
}

function DeviceDetails({
  device,
  groupId,
}: {
  device: Device;
  groupId?: string | null;
}) {
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
      {device.lastSeenAt && (
        <DeviceStatRow
          label="Last seen:"
          value={formatMinutesAgo({ date: device.lastSeenAt })}
        />
      )}
      {!!groupId && <DeviceStatRow label="Group:" value={groupId} />}
    </>
  );
}

export default async function TogglePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const deviceId = (await params).id;
  const session = await auth();

  const group = await db.query.deviceGroups.findFirst({
    where: (dg, { eq }) => eq(dg.deviceId, deviceId),
  });

  const groupId = group?.groupId;

  if (!groupId) {
    notFound();
  }

  const groupsWithDevices = await db.query.deviceGroups.findMany({
    where: (t, { eq }) => eq(t.groupId, groupId),
    with: {
      device: true,
    },
  });

  const device = groupsWithDevices.find(
    (g) => g.device.deviceId === deviceId,
  )?.device;

  if (!device) {
    notFound();
  }

  const deviceUserId = device?.userId;
  const sessionUserId = session?.user?.id;
  const isDeviceOwner = sessionUserId && deviceUserId === sessionUserId;
  const groupDevices = groupsWithDevices.map((g) => g.device);
  console.log("devices!!", JSON.stringify(group));
  return (
    <div className="flex flex-col h-screen">
      <PageHeader>
        <div className="flex flex-col justify-center">
          <div className="flex flex-row gap-4">
            <DeviceNameInput device={device} disabled={!isDeviceOwner} />
            <ClaimButton device={device} />
          </div>
          <div className="space-y-2 text-sm mt-4">
            <DeviceDetails device={device} groupId={groupId} />
          </div>
        </div>
      </PageHeader>
      {groupId && (
        <Scoreboard
          groupId={groupId}
          devices={new Map(groupDevices.map((gd) => [gd.deviceId, gd]))}
        />
      )}
    </div>
  );
}
