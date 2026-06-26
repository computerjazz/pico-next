"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { revalidatePath } from "next/cache";
import { onToggleDevicePost } from "../api/device/[id]/utils";

export async function toggleDevice({
  deviceId,
  state,
}: {
  deviceId?: string | null;
  state: "on" | "off";
}) {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    throw new Error("Unauthorized: Must be logged in to toggle device");
  }

  if (!deviceId) {
    throw new Error("Device id not provided");
  }

  const groups = await db.query.deviceGroups.findMany({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
    with: {
      device: true,
    },
  });

  const groupId = groups[0]?.groupId;

  if (!groupId) {
    throw new Error("Group not found");
  }

  const device = groups?.find(
    (g) => g.device?.userId === sessionUserId,
  )?.device;

  if (!device) {
    throw new Error("Unauthorized: you don't own a device in this group");
  }

  await onToggleDevicePost({
    deviceId,
    json: {
      state,
    },
  });

  revalidatePath(`/toggle/${groupId}`);
  revalidatePath(`/toggle/${deviceId}`);
}
