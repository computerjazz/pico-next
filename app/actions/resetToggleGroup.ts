"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { toggles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function resetToggleGroup({ groupId }: { groupId: string }) {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    throw new Error("Unauthorized: Must be logged in to reset toggle group");
  }

  const groups = await db.query.deviceGroups.findMany({
    where: (t, { eq }) => eq(t.groupId, groupId),
    with: {
      device: true,
    },
  });

  const device = groups?.find(
    (g) => g.device?.userId === sessionUserId,
  )?.device;

  if (!device) {
    throw new Error("Unauthorized: you don't own a device in this group");
  }

  // delete all events in group
  await db.delete(toggles).where(eq(toggles.groupId, groupId)).execute();

  revalidatePath(`/toggle/${groupId}`);
}
