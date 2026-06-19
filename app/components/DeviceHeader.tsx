"use client";
import { Device } from "@/db/schema";
import DeviceMenu from "./DeviceMenu";
import DeviceNameInput from "./DeviceNameInput";
import { shareDevice } from "../actions/shareDevice";
import { useState } from "react";
import PencilMini from "./icons/PencilMini";
import Share from "./icons/Share";

function DeviceHeader({
  device,
  disabled,
}: {
  device: Device;
  disabled?: boolean;
}) {
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);

  async function _shareDevice() {
    // Show a confirmation dialog before sharing
    const confirmed = window.confirm(
      "Sharing with another person will allow them to view all recordings for this device.\n\nDo you want to continue?",
    );
    if (!confirmed) return;
    const {
      share: { redeemCode },
    } = await shareDevice({
      deviceId: device.deviceId,
    });
    await navigator.clipboard.writeText(
      `${window.location.origin}/shortwave/${device.deviceId}/share/${redeemCode}`,
    );
  }

  const items = [
    {
      label: "Edit name",
      onClick: () => setIsEditingDeviceName(true),
      Icon: PencilMini,
    },
    {
      label: "Share device",
      onClick: _shareDevice,
      Icon: Share,
    },
  ];

  return (
    <div className="flex items-center gap-2 justify-center">
      <DeviceNameInput
        device={device}
        isEditing={isEditingDeviceName}
        onEditComplete={() => setIsEditingDeviceName(false)}
      />
      <DeviceMenu disabled={disabled} items={items} />
    </div>
  );
}

export default DeviceHeader;
