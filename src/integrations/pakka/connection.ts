import type { PeopleSettings } from "@pakka/protocol/webui";
import { POCKET_VERSION } from "@pakka/protocol/pocket";
import {
  createPocketClient,
  PocketRemoteError,
  type PocketClient,
  type PocketPerson,
} from "@pakka/client/pocket";
import {
  createWebUiServiceClient,
  type WebUiServiceClient,
} from "@pakka/client/webui";
import {
  createExtensionClient,
  type ExtensionClient,
} from "@pakka/client/extensions";

export interface PakkaConnection {
  readonly identity: string;
  readonly origin: string;
  readonly person: PocketPerson;
  readonly serverId: string;
  readonly sessionId: string;
  readonly signal: AbortSignal;
  readonly workbench: PocketClient;
  readonly services: WebUiServiceClient;
  readonly extensions: ExtensionClient;
  readonly peopleSettings: PeopleSettings;
  refreshPeopleSettings(): Promise<PeopleSettings>;
  subscribePeopleSettings(listener: () => void): () => void;
}

function csrf(): string | null {
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("pakka_csrf="))
      ?.slice("pakka_csrf=".length) ?? null
  );
}

/** Explicit application connection, with one immutable handshake identity per lifetime. */
export async function connectPakka(
  origin: string,
  signal: AbortSignal,
  expired: (message?: string) => void,
): Promise<PakkaConnection> {
  const workbench = createPocketClient({
    endpoint: `${origin}/pakka-webui/rpc`,
    csrf,
  });
  const hello = await workbench.request({ op: "hello" }, { signal });
  if (hello.kind !== "hello") throw new Error("Pakka 身份握手未得到确认。");
  const binding = {
    csrf,
    personId: () => hello.person.id,
    serverId: () => hello.serverId,
  };
  const services = createWebUiServiceClient({
    ...binding,
    endpoint: `${origin}/pakka-webui/services`,
  });
  const capabilities = await services.request(
    { op: "capabilities" },
    { signal },
  );
  if (
    capabilities.capabilities.workbench !== POCKET_VERSION ||
    capabilities.capabilities.extensions !== 3
  )
    throw new Error("前端与 Pakka 服务版本不兼容，请使用配对的版本。");
  signal.throwIfAborted();
  async function guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (reason) {
      if (
        !signal.aborted &&
        reason instanceof PocketRemoteError &&
        reason.code === "UNAUTHORIZED"
      )
        expired();
      throw reason;
    }
  }
  function checkServer<T extends { readonly serverId: string }>(result: T): T {
    if (result.serverId !== hello.serverId) {
      expired("Pakka 已重新启动，请重新连接以核对当前身份。");
      throw new Error("Pakka 服务身份已变化，原请求仍需核对。");
    }
    return result;
  }
  const extensions = createExtensionClient({
    ...binding,
    endpoint: `${origin}/pakka-webui/extensions/rpc`,
  });
  const protectedServices: WebUiServiceClient = {
    request: (command, options) =>
      guarded(() => services.request(command, options)),
  };
  let peopleSettings = (
    await services.request({ op: "people.settings" }, { signal })
  ).settings;
  signal.throwIfAborted();
  const settingsListeners = new Set<() => void>();
  async function refreshPeopleSettings() {
    const result = await guarded(() =>
      services.request({ op: "people.settings" }, { signal }),
    );
    signal.throwIfAborted();
    if (result.settings.version >= peopleSettings.version) {
      peopleSettings = result.settings;
      settingsListeners.forEach((listener) => listener());
    }
    return peopleSettings;
  }
  const refreshMode = () => {
    if (!signal.aborted && document.visibilityState === "visible")
      void refreshPeopleSettings().catch(() => {});
  };
  const modeTimer = window.setInterval(refreshMode, 30000);
  window.addEventListener("focus", refreshMode);
  signal.addEventListener(
    "abort",
    () => {
      window.clearInterval(modeTimer);
      window.removeEventListener("focus", refreshMode);
      settingsListeners.clear();
    },
    { once: true },
  );
  return Object.freeze<PakkaConnection>({
    get peopleSettings() {
      return peopleSettings;
    },
    refreshPeopleSettings,
    subscribePeopleSettings(listener) {
      settingsListeners.add(listener);
      return () => {
        settingsListeners.delete(listener);
      };
    },
    identity: JSON.stringify([hello.serverId, hello.person.id]),
    origin,
    person: hello.person,
    serverId: hello.serverId,
    sessionId: hello.sessionId,
    signal,
    workbench: {
      request: (command, options) =>
        guarded(async () =>
          checkServer(await workbench.request(command, options)),
        ),
      reconnect: (options) =>
        guarded(async () => checkServer(await workbench.reconnect(options))),
    },
    services: protectedServices,
    extensions: {
      assetUrl: extensions.assetUrl,
      list: (target, options) =>
        guarded(() => extensions.list(target, options)),
      call: (call, options) => guarded(() => extensions.call(call, options)),
      operation: (id, options) =>
        guarded(() => extensions.operation(id, options)),
      operationByRequest: (request, options) =>
        guarded(() => extensions.operationByRequest(request, options)),
      control: (change, options) =>
        guarded(() => extensions.control(change, options)),
      controlByRequest: (original, options) =>
        guarded(() => extensions.controlByRequest(original, options)),
    },
  });
}

/** This exchanges a human Pakka credential; provider authentication has a separate roadmap. */
export async function exchangeCredential(
  origin: string,
  input: { kind: "session" | "invite"; token: string; name?: string },
  signal: AbortSignal,
) {
  const response = await fetch(`${origin}/pakka-webui/exchange`, {
    method: "POST",
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "登录凭据已失效，请取得新的凭据。"
        : "登录未得到确认，请检查 Pakka 连接后重试身份验证。",
    );
  // The authoritative identity comes from a fresh public handshake, not the exchange body.
}

export function requestSignal(ui: AbortSignal, connection: PakkaConnection) {
  return AbortSignal.any([ui, connection.signal]);
}
export function describeFailure(error: unknown): string {
  if (error instanceof PocketRemoteError) {
    const messages: Record<string, string> = {
      UNAUTHORIZED: "尚未登录或登录已过期。",
      FORBIDDEN: "当前身份没有此操作的权限。",
      VERSION_MISMATCH: "前端与服务版本不兼容。",
      CONFLICT: "配置已经变化，请重新读取后再编辑。",
      CONVERSATION_UNAVAILABLE: "原 Conversation 当前不可得。",
      CAPACITY: "服务正忙，请稍后读取状态。",
      UNSUPPORTED: "当前服务不支持此能力。",
      INVALID_REQUEST: "请求未通过校验，请检查输入。",
      UNKNOWN:
        "暂时无法确认服务状态。请检查连接；如果刚刚提交了更改，请勿重复提交。",
    };
    return messages[error.code] ?? "操作未能完成。";
  }
  if (error instanceof Error && error.name === "AbortError")
    return "界面读取已结束。";
  return error instanceof Error ? error.message : "操作未能完成。";
}
