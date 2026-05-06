import { db } from "@/db";
import Scoreboard from "./Scoreboard";
import { Device } from "@/db/schema";

type PageParams = {
  groupId: string;
};

export default async function ToggleGroupPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const groupId = (await params).groupId;
  // Get unique deviceIds from toggles for this group
  const togglesForGroup = await db.query.toggles.findMany({
    where: (t, { eq }) => eq(t.groupId, groupId),
    with: {
      device: true,
    },
  });

  const devices = togglesForGroup.reduce((acc, cur) => {
    const curDevice = cur.device;
    if (!curDevice) return acc;
    acc.set(curDevice.deviceId, curDevice);
    return acc;
  }, new Map<string, Device>());
  return <Scoreboard groupId={groupId} devices={devices} />;
}
