"use client";
import { Device } from "@/db/schema";
import DeviceMenu from "./DeviceMenu";
import DeviceNameInput from "./DeviceNameInput";
import { shareDevice } from "../actions/shareDevice";
import { useState } from "react";
import PencilMini from "./icons/PencilMini";
import Share from "./icons/Share";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";

function DeviceHeader({
  device,
  disabled,
}: {
  device: Device;
  disabled?: boolean;
}) {
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  async function _shareDevice() {
    const ok = await confirm({
      title: "Share this device?",
      description:
        "A single-use link will be created that will give the invited person access to this device.",
      confirmText: "Share",
      destructive: true,
    });

    if (!ok) return;
    const {
      share: { redeemCode },
    } = await shareDevice({
      deviceId: device.deviceId,
    });
    await navigator.clipboard.writeText(
      `${window.location.origin}/shortwave/${device.deviceId}/share/${redeemCode}`,
    );
    toast.success("Link copied to clipboard");
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
      {ConfirmDialog}
    </div>
  );
}

export default DeviceHeader;
