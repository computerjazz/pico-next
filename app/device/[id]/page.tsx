import { db } from "@/db";
import { notFound } from "next/navigation";
import VolumeInput from "./VolumeInput";
import DeviceNameInput from "./DeviceNameInput";

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

  const device = await db.query.devices.findFirst({
    where: (d, { eq }) => eq(d.deviceId, deviceId),
  });

  if (!device) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl p-6 space-y-8">
      <h1 className="text-2xl font-bold mb-2">
        <DeviceNameInput device={device} />
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
      {device.type === "shortwave" && <VolumeInput device={device} />}
    </div>
  );
}
