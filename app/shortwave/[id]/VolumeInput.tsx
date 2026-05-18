"use client";

import { setDeviceVolume } from "@/app/actions/setDeviceVolume";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Device } from "@/db/schema";
import throttle from "lodash/throttle";

function VolumeInput({
  device,
  disabled,
}: {
  device: Device;
  disabled?: boolean;
}) {
  const throttledOnChange = useStableCallback(
    throttle(
      async (v: string) => {
        if (disabled) return;
        await setDeviceVolume({
          deviceId: device.deviceId,
          volume: Number(v),
        });
      },
      500,
      { leading: false, trailing: true },
    ),
  );
  return (
    <>
      <input
        id="volume"
        name="volume"
        type="range"
        min={0}
        max={100}
        step={1}
        defaultValue={device.volume ?? 25}
        className="w-48 accent-muted-foreground"
        autoComplete="off"
        disabled={disabled}
        onChange={({ target }) => {
          const newV = target.value;
          throttledOnChange(newV);
        }}
      />
    </>
  );
}

export default VolumeInput;
