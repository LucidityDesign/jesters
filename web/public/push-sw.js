/* global self, URL */
// Shows the backend's push notifications ("Your turn", "Game over", …) while Jesters isn't in
// front, and opens the game when one is clicked. The payload is Firebase Cloud
// Messaging's: `notification` holds the texts (see backend/functions/src/notify/push.ts) and
// `data.gameId` the game.

const SAFARI =
  /Safari/.test(self.navigator.userAgent) &&
  !/Chrome|Chromium|CriOS|Edg|Android/.test(self.navigator.userAgent);

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!payload?.notification) return;
  const { title, body, icon, tag } = payload.notification;
  const gameId = payload.data?.gameId;
  event.waitUntil(
    (async () => {
      // A player looking at the app sees the change there already. Safari, though, revokes the
      // subscription after pushes that show nothing, so there it is shown silently and closed.
      // Focused, not just visible: on a desktop a window stays visible behind other apps.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const looking = windows.some(
        (client) => client.focused && client.visibilityState === "visible",
      );
      if (looking && !SAFARI) return;
      await self.registration.showNotification(title ?? "Jesters", {
        body,
        icon: icon ?? "/icon-192.png",
        tag,
        renotify: Boolean(tag),
        data: { path: gameId ? `/game/${gameId}` : "/" },
        silent: looking,
      });
      if (looking) {
        const shown = await self.registration.getNotifications({ tag });
        for (const notification of shown) notification.close();
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.path ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // The app's router takes it from there (see notifications.ts).
        open.postMessage({ type: "open", path: event.notification.data?.path ?? "/" });
        await open.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
