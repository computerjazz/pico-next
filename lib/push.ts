// lib/push.ts
import webpush from "web-push";
import { db } from "@/db";
import { CHANNEL_TYPE } from "./constants";
import { z } from "zod";

export const SubscriptionPayloadSchema = z.object({
  deviceId: z.string(),
  endpoint: z.string(),
  keys: z.object({
    auth: z.string(),
    p256dh: z.string(),
  }),
});

export type SubscriptionPayload = z.infer<typeof SubscriptionPayloadSchema>;

webpush.setVapidDetails(
  "mailto:hi@danielmerrill.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function sendWebPush(payload: {
  title: string;
  body: string;
  deviceId: string;
}) {
  const deviceChannels = await db.query.deviceChannels.findMany({
    where: (t, { and, eq }) =>
      and(eq(t.deviceId, payload.deviceId), eq(t.type, CHANNEL_TYPE.WEB_PUSH)),
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
