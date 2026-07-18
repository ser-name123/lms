/*
 * Service worker for Web Push.
 *
 * Deliberately minimal: it does not cache anything and does not intercept
 * fetches. Its only job is to show a notification when one is pushed and to
 * focus the right tab when it is clicked. A caching service worker on an
 * authenticated dashboard is a good way to serve one user another user's data,
 * so this one stays out of the network path entirely.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Notification", body: event.data.text() };
  }

  const title = payload.title || "Notification";
  const options = {
    body: payload.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { link: payload.link || "/dashboard" },
    // Same tag collapses repeats of one event instead of stacking them.
    tag: payload.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab on this origin rather than piling up new windows.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
