import { db } from "@/db";

type DeviceAccess = { isOwner: boolean; isShare: boolean };

export async function getDeviceAccess({
  deviceId,
  userId,
}: {
  deviceId?: string | null;
  userId?: string | null;
}): Promise<DeviceAccess> {
  if (!deviceId || !userId) {
    return {
      isOwner: false,
      isShare: false,
    };
  }

  const device = await db.query.devices.findFirst({
    where: (t, { eq }) => eq(t.deviceId, deviceId),
  });

  if (!device) {
    return {
      isOwner: false,
      isShare: false,
    };
  }

  const isOwner = device.userId === userId;
  if (isOwner) {
    return {
      isOwner: true,
      isShare: false,
    };
  }
  const share = await db.query.deviceShares.findFirst({
    where: (t, { eq, and }) =>
      and(eq(t.deviceId, deviceId), eq(t.userId, userId)),
  });

  return {
    isOwner: false,
    isShare: !!share,
  };
}
