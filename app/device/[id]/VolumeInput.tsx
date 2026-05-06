"use client";

import { setDeviceVolume } from "@/app/actions/setDeviceVolume";
import { useStableCallback } from "@/app/hooks/useStableCallback";
import { Device } from "@/db/schema";
import throttle from "lodash/throttle";

function VolumeInput({ device }: { device: Device }) {
  const throttledOnChange = useStableCallback(
    throttle(
      async (v: string) => {
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
      <label htmlFor="volume" className="block font-medium text-sm">
        Set Device Volume
      </label>
      <input
        id="volume"
        name="volume"
        type="range"
        min={0}
        max={100}
        step={1}
        defaultValue={device.volume ?? 25}
        className="w-full"
        autoComplete="off"
        onChange={({ target }) => {
          const newV = target.value;
          throttledOnChange(newV);
        }}
      />
      <div className="flex justify-between text-xs text-neutral-500">
        <span>0</span>
        <span>100</span>
      </div>
    </>
  );
}

export default VolumeInput;
