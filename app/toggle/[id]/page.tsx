import { db } from "@/db";
import { notFound } from "next/navigation";
import DeviceNameInput from "../../components/DeviceNameInput";
import { auth } from "@/auth";
import ClaimButton from "../../components/ClaimButton";
import { Device } from "@/db/schema";
import PageHeader from "@/app/components/PageHeader";
import Scoreboard from "../group/[groupId]/Scoreboard";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

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
  const redis = await getRedis();
  const key = `${REDIS_KEYS.DEVICE_LOGS_PREFIX}-${deviceId}`;
  const logs = await redis.get(key);

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
      <div className="flex flex-col max-w-2xl mx-auto p-4">
        {groupId && (
          <div className="mt-10">
            <h1 className="text-3xl font-bold">Leaderboard</h1>

            <Scoreboard
              groupId={groupId}
              devices={new Map(groupDevices.map((gd) => [gd.deviceId, gd]))}
            />
          </div>
        )}
        {isDeviceOwner && !!logs && (
          <div className="mt-48 flex flex-col flex-wrap">
            <h1 className="font-bold text-2xl">Device Logs</h1>
            <pre className="whitespace-pre-wrap wrap-anywhere max-h-screen overflow-hidden overflow-y-scroll">
              {logs}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
