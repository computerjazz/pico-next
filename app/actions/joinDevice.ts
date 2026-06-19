"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { deviceShares } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function joinDevice({ redeemCode }: { redeemCode: string }) {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  console.log("joining", redeemCode);
  if (!sessionUserId) {
    throw new Error("must be logged in to rename device");
  }
  const invite = await db.query.deviceShares.findFirst({
    where: (t, { eq }) => eq(t.redeemCode, redeemCode),
    with: {
      device: true,
    },
  });

  if (!invite?.device) {
    throw new Error("device not found with given owner");
  }

  if (invite.userId) {
    throw new Error("invite code already redeemed");
  }

  if (
    invite.redeemCodeExpiresAt &&
    invite.redeemCodeExpiresAt.getTime() < new Date().getTime()
  ) {
    throw new Error("invite code is expired");
  }
  const [share] = await db
    .update(deviceShares)
    .set({
      userId: sessionUserId,
    })
    .where(eq(deviceShares.redeemCode, redeemCode))
    .returning();

  return { success: true, share };
}
