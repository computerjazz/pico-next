// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceChannels, pushSubscriptions } from "@/db/schema";
import { CHANNEL_TYPE } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const subscription = await req.json();

  const { endpoint, keys, deviceId } = subscription;
  const { p256dh, auth } = keys;

  await db
    .insert(pushSubscriptions)
    .values({ endpoint, p256dh, auth })
    .onConflictDoNothing();

  const push = await db.query.pushSubscriptions.findFirst({
    where: (t, { eq }) => eq(t.endpoint, endpoint),
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

  return NextResponse.json({ ok: true });
}
