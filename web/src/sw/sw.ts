/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL } from 'workbox-precaching';
import { PERIODIC_SYNC_TAG } from '@/shared/reminderConfig';
import { APP_INTENT_OPEN_ADD, OPEN_ADD_QUERY_PARAM } from '@/shared/appIntents';
import { runReminderCheck } from '@/sw/reminderCheck';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();
void self.skipWaiting();

const navigationHandler = createHandlerBoundToURL('/index.html');
registerRoute(new NavigationRoute(navigationHandler, { denylist: [/^\/api\//] }));

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

self.addEventListener('periodicsync', (event: Event) => {
  const syncEvent = event as PeriodicSyncEvent;
  if (syncEvent.tag === PERIODIC_SYNC_TAG) {
    syncEvent.waitUntil(runReminderCheck(self.registration));
  }
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'REMINDER_CHECK_NOW') {
    event.waitUntil(runReminderCheck(self.registration));
    return;
  }
  if (event.data?.type === 'REMINDER_CONFIG_UPDATED') {
    event.waitUntil(runReminderCheck(self.registration));
  }
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      if (allClients.length > 0) {
        const client = allClients[0];
        await client.focus();
        client.postMessage({ type: APP_INTENT_OPEN_ADD });
        return;
      }
      await self.clients.openWindow(`/record?${OPEN_ADD_QUERY_PARAM}=1`);
    })(),
  );
});
