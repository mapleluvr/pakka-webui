/// <reference lib="webworker" />
import {
  WEBUI_NOTIFICATION_EVENT_PATH,
  decodeNotificationEvent,
  decodeNotificationWake,
} from "@pakka/protocol/webui";
import { viewHref } from "../../host/links.js";
import { conversationResource } from "./resources.js";
import {
  decodeNotificationWorkerCommand,
  type NotificationWorkerReply,
} from "./notification-messages.js";
declare const self: ServiceWorkerGlobalScope;
let privacyRevision = 0;
const tag = (wake: { eventId: string; deviceId: string }) =>
  `pakka:${wake.deviceId}:${wake.eventId}`;
function appWindow(value: string) {
  try {
    const url = new URL(value);
    return url.origin === self.location.origin && url.pathname === "/";
  } catch {
    return false;
  }
}
function owned(notification: Notification) {
  if (
    notification.tag.startsWith("pakka:") ||
    notification.tag.startsWith("pakka-")
  )
    return true;
  try {
    decodeNotificationWake(notification.data);
    return true;
  } catch {
    return false;
  }
}
async function badge(value: number) {
  if (
    value &&
    "setAppBadge" in self.navigator &&
    typeof self.navigator.setAppBadge === "function"
  )
    await self.navigator.setAppBadge(value);
  if (
    !value &&
    "clearAppBadge" in self.navigator &&
    typeof self.navigator.clearAppBadge === "function"
  )
    await self.navigator.clearAppBadge();
}
async function clear() {
  for (const notification of await self.registration.getNotifications())
    if (owned(notification)) notification.close();
  await badge(0);
}
async function authorized(wake: ReturnType<typeof decodeNotificationWake>) {
  const url = new URL(WEBUI_NOTIFICATION_EVENT_PATH, self.location.origin);
  url.search = new URLSearchParams({
    eventId: wake.eventId,
    deviceId: wake.deviceId,
  }).toString();
  const response = await fetch(url, {
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      privacyRevision++;
      await clear();
    }
    throw new Error("通知当前未获授权。");
  }
  const event = decodeNotificationEvent(await response.json());
  if (event.id !== wake.eventId) throw new Error("通知原事件不匹配。");
  return event;
}
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  privacyRevision++;
  event.waitUntil(
    (async () => {
      try {
        await clear();
      } catch {
        /* Activation never renders private content. */
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const revision = privacyRevision;
      const wake = decodeNotificationWake(event.data?.json());
      const entry = await authorized(wake);
      if (revision !== privacyRevision) return;
      const titles = {
        done: "工作已完成",
        approval: "等待工具审批",
        chat: "人类聊天更新",
        mention: "有人提及你",
      };
      await self.registration.showNotification(
        `Pakka · ${titles[entry.kind]}`,
        { body: entry.preview, tag: tag(wake), data: wake },
      );
      if (revision !== privacyRevision) {
        for (const notification of await self.registration.getNotifications({
          tag: tag(wake),
        }))
          notification.close();
        return;
      }
      await badge(1);
    })().catch(() => {
      /* Invalid, mismatched or unauthorized wakeups never render private content. */
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const revision = privacyRevision;
      const data: unknown = event.notification.data;
      let href = "#/";
      const local =
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        Object.keys(data).join(",") === "kind" &&
        "kind" in data &&
        data.kind === "local-check";
      if (!local) {
        const entry = await authorized(decodeNotificationWake(data));
        href = viewHref({
          plugin: "conversations",
          view: "history",
          resource: conversationResource(entry.target),
        });
      }
      if (revision !== privacyRevision) return;
      const destination = new URL("/" + href, self.location.origin).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => appWindow(client.url));
      if (revision !== privacyRevision) return;
      if (existing) {
        const navigated = await existing.navigate(destination);
        await navigated?.focus();
      } else await self.clients.openWindow(destination);
      if (!(await self.registration.getNotifications()).some(owned))
        await badge(0);
    })().catch(() => {
      /* Clicks re-authorize; stale notifications cannot open private history. */
    }),
  );
});
self.addEventListener("message", (event) => {
  if (!event.source || !("url" in event.source)) return;
  if (!appWindow(event.source.url)) return;
  event.waitUntil(
    (async () => {
      const command = decodeNotificationWorkerCommand(event.data);
      let status: NotificationWorkerReply["status"] = "failed";
      try {
        if (command.kind === "clear") {
          privacyRevision++;
          await clear();
        } else {
          const revision = privacyRevision;
          await self.registration.showNotification("Pakka · 系统显示检查", {
            body: "这是一条本浏览器显示检查通知，不代表远端推送已经到达。",
            tag: "pakka:local-check",
            data: { kind: "local-check" },
          });
          if (revision !== privacyRevision) {
            await clear();
            throw new Error("通知显示已结束。");
          }
        }
        status = "accepted";
      } catch {
        /* Only a finite native outcome is returned, not private event content. */
      }
      const reply: NotificationWorkerReply = {
        kind: "pakka-notifications",
        requestId: command.requestId,
        status,
      };
      event.ports[0]?.postMessage(reply);
    })().catch(() => {
      /* Malformed messages never invoke native actions. */
    }),
  );
});
