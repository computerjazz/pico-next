self.addEventListener("push", (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/img/icons/icon-192.png",
      data: { url: `/shortwave/${data.deviceId}` },
    }),
  );
});

// When user clicks the notification, open the right chat
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
