import { WEBUI_SERVICE_WORKER_PATH } from "@pakka/protocol/webui-assets";
import type { NotificationRequest } from "@pakka/protocol/webui";
import {
  decodeNotificationWorkerReply,
  type NotificationWorkerCommand,
} from "./notification-messages.js";
type SubscriptionInput = Extract<
  NotificationRequest,
  { op: "notification.subscribe" }
>["input"]["subscription"];
export interface NativeNotificationState {
  readonly supported: boolean;
  readonly pushSupported: boolean;
  readonly permission: NotificationPermission | "unsupported";
  readonly subscribed: boolean;
  readonly subscriptionKey: string | null;
}
let registration: Promise<ServiceWorkerRegistration> | null = null;
export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}
/** The permission prompt is called before any await, directly from a human gesture. */
export function requestNotificationPermission() {
  if (!("Notification" in window))
    return Promise.reject(new Error("本浏览器不支持系统通知。"));
  return Notification.permission === "default"
    ? Notification.requestPermission()
    : Promise.resolve(Notification.permission);
}
export function registerNotificationWorker(): Promise<ServiceWorkerRegistration> {
  if (!isSecureContext || !("serviceWorker" in navigator))
    return Promise.reject(
      new Error("此浏览器或地址不支持受信任的通知 worker。"),
    );
  if (!registration) {
    registration = navigator.serviceWorker
      .register(WEBUI_SERVICE_WORKER_PATH, {
        scope: "/",
        type: "classic",
        updateViaCache: "none",
      })
      .then(async (value) => {
        if (value.active?.state === "activated") return value;
        await new Promise<void>((resolve, reject) => {
          const workers = new Set<ServiceWorker>();
          const finish = (error?: Error) => {
            clearTimeout(timeout);
            value.removeEventListener("updatefound", inspect);
            for (const worker of workers)
              worker.removeEventListener("statechange", inspect);
            error ? reject(error) : resolve();
          };
          const inspect = () => {
            if (value.active?.state === "activated") {
              finish();
              return;
            }
            for (const worker of [
              value.installing,
              value.waiting,
              value.active,
            ])
              if (worker && !workers.has(worker)) {
                workers.add(worker);
                worker.addEventListener("statechange", inspect);
              }
            if (
              workers.size &&
              [...workers].every((worker) => worker.state === "redundant")
            )
              finish(new Error("通知 worker 未能激活。"));
          };
          const timeout = setTimeout(
            () => finish(new Error("通知 worker 激活尚未得到确认。")),
            15000,
          );
          value.addEventListener("updatefound", inspect);
          inspect();
        });
        return value;
      });
    void registration.catch(() => {
      registration = null;
    });
  }
  return registration;
}
function base64url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function serverKey(value: string) {
  const source = value.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(source + "=".repeat((4 - (source.length % 4)) % 4));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
export function subscriptionInput(value: PushSubscription): SubscriptionInput {
  const p256dh = value.getKey("p256dh"),
    auth = value.getKey("auth");
  if (!p256dh || !auth) throw new Error("浏览器订阅没有完整的加密密钥。");
  return {
    endpoint: value.endpoint,
    keys: { p256dh: base64url(p256dh), auth: base64url(auth) },
  };
}
async function subscriptionKey(value: SubscriptionInput) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      endpoint: value.endpoint,
      keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
    }),
  );
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
export async function nativeNotificationState(): Promise<NativeNotificationState> {
  const supported =
    isSecureContext && "Notification" in window && "serviceWorker" in navigator;
  const pushSupported = supported && "PushManager" in window;
  if (!supported)
    return {
      supported,
      pushSupported,
      permission: notificationPermission(),
      subscribed: false,
      subscriptionKey: null,
    };
  const worker = await registerNotificationWorker();
  const subscription = pushSupported
    ? await worker.pushManager.getSubscription()
    : null;
  return {
    supported,
    pushSupported,
    permission: notificationPermission(),
    subscribed: !!subscription,
    subscriptionKey: subscription
      ? await subscriptionKey(subscriptionInput(subscription))
      : null,
  };
}
export async function subscribeBrowser(
  publicKey: string,
  signal: AbortSignal,
): Promise<SubscriptionInput> {
  signal.throwIfAborted();
  const worker = await registerNotificationWorker();
  signal.throwIfAborted();
  if (!("PushManager" in window))
    throw new Error("本浏览器不支持远端推送订阅。");
  if (Notification.permission !== "granted")
    throw new Error("系统通知权限尚未允许。");
  let subscription = await worker.pushManager.getSubscription();
  signal.throwIfAborted();
  if (
    subscription?.options.applicationServerKey &&
    base64url(subscription.options.applicationServerKey) !== publicKey
  )
    throw new Error(
      "浏览器订阅使用另一服务公钥；请显式移除本浏览器订阅后再登记。",
    );
  subscription ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey(publicKey),
  });
  signal.throwIfAborted();
  return subscriptionInput(subscription);
}
export async function notificationWorkerCommand(
  kind: NotificationWorkerCommand["kind"],
  signal?: AbortSignal,
) {
  const worker = await registerNotificationWorker();
  signal?.throwIfAborted();
  if (!worker.active) throw new Error("通知 worker 尚未激活。");
  const channel = new MessageChannel(),
    requestId = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", aborted);
        error ? reject(error) : resolve();
      };
      const aborted = () =>
        finish(new DOMException("界面读取已结束。", "AbortError"));
      const timeout = setTimeout(
        () => finish(new Error("浏览器通知动作尚未确认。")),
        10000,
      );
      signal?.addEventListener("abort", aborted, { once: true });
      channel.port1.onmessage = (event) => {
        try {
          const reply = decodeNotificationWorkerReply(event.data);
          if (reply.requestId !== requestId)
            throw new Error("通知 worker 回应不属于原请求。");
          finish(
            reply.status === "accepted"
              ? undefined
              : new Error("浏览器未确认通知动作，请检查系统权限。"),
          );
        } catch (reason) {
          finish(
            reason instanceof Error
              ? reason
              : new Error("通知 worker 回应未通过校验。"),
          );
        }
      };
      channel.port1.start();
      worker.active!.postMessage(
        { kind, requestId } satisfies NotificationWorkerCommand,
        [channel.port2],
      );
    });
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
}
export async function removeBrowserSubscription(signal: AbortSignal) {
  const worker = await registerNotificationWorker();
  signal.throwIfAborted();
  const subscription = await worker.pushManager.getSubscription();
  signal.throwIfAborted();
  if (subscription && !(await subscription.unsubscribe()))
    throw new Error("浏览器订阅移除尚未确认。");
  await notificationWorkerCommand("clear", signal);
}
export function describeNotificationBrowserFailure(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "NotAllowedError")
    return "浏览器没有允许通知或推送订阅。";
  if (reason instanceof DOMException && reason.name === "NotSupportedError")
    return "本浏览器不支持此通知操作。";
  return reason instanceof Error ? reason.message : "浏览器通知操作尚未确认。";
}
