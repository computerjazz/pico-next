// lib/push.ts
import webpush from "web-push";
import { db } from "@/db";

webpush.setVapidDetails(
  "mailto:hi@danielmerrill.com",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function sendPush(payload: {
  title: string;
  body: string;
  deviceId: string;
}) {
  const deviceChannels = await db.query.deviceChannels.findMany({
    where: (t, { and, eq }) =>
      and(eq(t.deviceId, payload.deviceId), eq(t.type, "web-push")),
  });

  const subscriptionIds = deviceChannels.map((dc) => dc.channelId);

  const subscriptions = await db.query.pushSubscriptions.findMany({
    where: (t, { inArray }) => inArray(t.id, subscriptionIds),
  });

  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      ),
    ),
  );
}
