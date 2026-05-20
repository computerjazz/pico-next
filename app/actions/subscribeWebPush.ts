"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { deviceChannels, pushSubscriptions } from "@/db/schema";
import { CHANNEL_TYPE } from "@/lib/constants";
import { SubscriptionPayload, SubscriptionPayloadSchema } from "@/lib/push";

export async function subscribeWebPush(payload: SubscriptionPayload) {
  const payloadParsed = SubscriptionPayloadSchema.safeParse(payload);
  const session = await auth();
  if (!session?.user?.id || !payloadParsed.success) {
    return { success: false };
  }

  const { deviceId, endpoint, keys } = payloadParsed.data;

  await db
    .insert(pushSubscriptions)
    .values({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: session.user.id,
    })
    .onConflictDoNothing();

  const push = await db.query.pushSubscriptions.findFirst({
    where: (t, { eq }) => eq(t.endpoint, payload.endpoint),
  });

  if (push) {
    const existing = await db.query.deviceChannels.findFirst({
      where: (t, { eq, and }) =>
        and(
          eq(t.deviceId, deviceId),
          eq(t.channelId, push.id),
          eq(t.type, CHANNEL_TYPE.WEB_PUSH),
        ),
    });
    if (!existing) {
      await db
        .insert(deviceChannels)
        .values({
          deviceId,
          channelId: push.id,
          type: CHANNEL_TYPE.WEB_PUSH,
        })
        .onConflictDoNothing();
    }
  }
  return { success: true };
}
