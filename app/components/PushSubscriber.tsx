"use client";

import { useEffect } from "react";

const PushSubscriber = ({
  shouldPrompt,
  scope,
}: {
  shouldPrompt: boolean;
  scope: string;
}) => {
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in navigator || !shouldPrompt)
    ) {
      console.log(
        "cannot register",
        navigator,
        "serviceWorker" in navigator,
        "PushManager" in navigator,
      );
      return;
    }

    async function setup() {
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope,
      });

      // Don't re-subscribe if already subscribed
      const existing = await reg.pushManager.getSubscription();
      if (existing) return;

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription),
      });
    }

    setup();
  }, [shouldPrompt, scope]);

  return null;
};

export default PushSubscriber;
