// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceChannels, pushSubscriptions } from "@/db/schema";

export async function POST(req: NextRequest) {
  const subscription = await req.json();
  console.log("subscription", subscription);

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
    await db
      .insert(deviceChannels)
      .values({
        deviceId,
        channelId: push.id,
        type: "web-push",
      })
      .onConflictDoNothing();
  }

  return NextResponse.json({ ok: true });
}
