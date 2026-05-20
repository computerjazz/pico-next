"use client";

import { useEffect } from "react";
import { subscribeWebPush } from "../actions/subscribeWebPush";

const PushSubscriber = ({
  shouldPrompt,
  scope,
  deviceId,
}: {
  shouldPrompt: boolean;
  scope: string;
  deviceId: string;
}) => {
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !shouldPrompt
    ) {
      console.log(
        "cannot register sw, pm:",
        "serviceWorker" in navigator,
        "PushManager" in navigator,
      );
      return;
    }

    async function setup() {
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope,
      });

      const existing = await reg.pushManager.getSubscription();

      const subscription =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        }));

      const sub = JSON.parse(JSON.stringify(subscription));
      const payload = { ...sub, deviceId };
      await subscribeWebPush(payload);
    }

    setup();
  }, [shouldPrompt, scope, deviceId]);

  return null;
};

export default PushSubscriber;
