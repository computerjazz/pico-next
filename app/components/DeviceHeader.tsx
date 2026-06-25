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
import ArrowUTurnLeft from "./icons/ArrowUturnLeft";
import { resetToggleGroup } from "../actions/resetToggleGroup";
import { useRouter } from "next/navigation";

function DeviceHeader({
  device,
  disabled,
  groupId,
}: {
  device: Device;
  groupId?: string;
  disabled?: boolean;
}) {
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();

  async function _shareDevice() {
    const ok = await confirm({
      title: "Share this device?",
      description:
        "A single-use link will be created that will let the invited person view past recordings and record new answering machine messages.",
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

  async function _resetToggleGroup() {
    if (!groupId) {
      toast.error("No group found");
      return;
    }

    const ok = await confirm({
      title: "Reset group?",
      description:
        "This will reset the leaderboard and erase all toggle events.",
      confirmText: "Reset",
      cancelText: "Cancel",
      destructive: true,
    });

    if (!ok) return;
    await resetToggleGroup({ groupId });

    router.refresh();
    toast.success("Group reset");
  }

  const items = [
    {
      label: "Edit name",
      onClick: () => setIsEditingDeviceName(true),
      Icon: PencilMini,
      deviceType: ["shortwave", "toggle"],
    },
    {
      label: "Share device",
      onClick: _shareDevice,
      Icon: Share,
      deviceType: ["shortwave"],
    },
    {
      label: "Reset group",
      onClick: _resetToggleGroup,
      Icon: ArrowUTurnLeft,
      deviceType: ["toggle"],
    },
  ].filter((item) => item.deviceType.includes(device.type));

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
