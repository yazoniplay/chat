self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "You have a new notification." }; }
  const title = payload.title || "Tuffchat";
  const options = {
    body: payload.body || "You have a new notification.",
    tag: payload.tag || "tuffchat",
    data: { url: payload.url || "/chat/" },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/chat/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) { await client.focus(); if ("navigate" in client) await client.navigate(target); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});