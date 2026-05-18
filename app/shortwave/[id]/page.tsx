import { db } from "@/db";
import { notFound } from "next/navigation";
import VolumeInput from "./VolumeInput";
import DeviceNameInput from "../../components/DeviceNameInput";
import { auth } from "@/auth";
import ClaimButton from "../../components/ClaimButton";
import ProfileSignInButton from "@/app/components/ProfileSignInButton";
import { RecordingsList } from "./RecordingsList";
import { Device, devices, recordings } from "@/db/schema";
import { eq, isNull, and, asc } from "drizzle-orm";
import RecordingButton from "./RecordingButton";
import PageHeader from "@/app/components/PageHeader";

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

function CornerMask({ className }: { className?: string }) {
  return (
    <svg
      className={`${className}`}
      width="20"
      height="20"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="
          M0,0
          H40
          V40
          H0
          Z
          M0,40
          A40,40 0 0 1 40,0
          L40,40
          Z
        "
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
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

  const deviceUserId = device?.userId;
  const sessionUserId = session?.user?.id;
  const isDeviceOwner = sessionUserId && deviceUserId === sessionUserId;

  return (
    <div className="flex flex-col h-screen">
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
      <div className="flex flex-1 flex-col overflow-y-hidden relative">
        <div className="max-w-md mx-auto flex flex-col flex-1 min-h-0 overflow-y-scroll relative px-4">
          {device.type === "shortwave" && isDeviceOwner && (
            <>
              <div className="fixed bottom-2 right-4 z-40">
                <RecordingButton deviceId={deviceId} />
              </div>
              <div className="flex flex-1">
                <RecordingsList recordings={recordingItems} />
              </div>
            </>
          )}
        </div>
        <div
          className="absolute flex flex-1 left-0 right-0 top-0 z-50 text-background max-w-md mx-auto"
          style={{ transform: "translateY(-1px)" }}
        >
          <div className="flex flex-1 justify-between text-background">
            {/* Top Left Mask SVG */}
            <div className="flex flex-row">
              <div className="w-4 h-12 bg-background rounded-br-full" />

              <CornerMask className="" />
            </div>
            <div className="flex flex-row">
              <CornerMask className="-scale-x-100" />
              <div className="w-4 h-12 bg-background rounded-bl-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
