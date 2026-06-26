"use client";

import { setDeviceVolume } from "@/app/actions/setDeviceVolume";
import { Device } from "@/db/schema";
import throttle from "lodash/throttle";
import { useMemo, useState } from "react";

function VolumeInput({
  device,
  disabled,
}: {
  device: Device;
  disabled?: boolean;
}) {
  const { deviceId, volume } = device;
  const [optimisticVolume, setOptimisticVolume] = useState(
    volume ? Number(volume) : 0,
  );
  const throttledOnChange = useMemo(
    () =>
      throttle(
        async (v: number) => {
          if (disabled) return;
          await setDeviceVolume({
            deviceId,
            volume: Number(v),
          });
        },
        1000,
        { leading: false, trailing: true },
      ),
    [deviceId, disabled],
  );
  return (
    <>
      <div className="flex flex-row font-semibold text-muted-foreground text-xs gap-2">
        <div>Volume:</div>
        <div className="w-5">{optimisticVolume}%</div>
      </div>
      <input
        id="volume"
        name="volume"
        type="range"
        min={0}
        max={100}
        step={1}
        defaultValue={optimisticVolume}
        className="flex-1 max-w-48 accent-muted-foreground"
        autoComplete="off"
        disabled={disabled}
        onChange={({ target }) => {
          const newV = Number(target.value);
          setOptimisticVolume(newV);
          throttledOnChange(newV);
        }}
      />
    </>
  );
}

export default VolumeInput;
