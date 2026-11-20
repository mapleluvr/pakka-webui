import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import type { AgentRef } from "@pakka/protocol";
import type { PocketClientResult } from "@pakka/client/pocket";
import type { UiViewProps } from "@pakka/webui-sdk";
import {
  conversationReference,
  conversationResource,
} from "../../integrations/pakka/resources.js";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import {
  describeNotificationBrowserFailure,
  nativeNotificationState,
  notificationWorkerCommand,
  removeBrowserSubscription,
  requestNotificationPermission,
  subscribeBrowser,
  type NativeNotificationState,
} from "../../integrations/pakka/notification-browser.js";
import {
  useNotificationChanges,
  type NotificationStatus,
} from "./useNotificationChanges.js";
import "./notification-settings.css";

type Listing = Extract<PocketClientResult, { kind: "list" }>;
const kinds = [
  ["done", "工作完成"],
  ["approval", "工具审批"],
  ["chat", "人类聊天"],
  ["mention", "提及我"],
] as const;
const permissionLabel = {
  default: "尚未选择",
  granted: "已允许",
  denied: "已阻止",
  unsupported: "不支持",
};
function actionLabel(op: string) {
  return op === "notification.preferences"
    ? "个人偏好保存"
    : op === "notification.subscribe"
      ? "目标登记"
      : "设备停用";
}
export function NotificationSettingsView({
  ui,
  bindings: connection,
}: UiViewProps<PakkaConnection>) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [target, setTarget] = useState<AgentRef | null>(null);
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [draft, setDraft] = useState<NotificationStatus["preferences"] | null>(
    null,
  );
  const dirty = useRef(false);
  const [native, setNative] = useState<NativeNotificationState | null>(null);
  const [revision, setRevision] = useState(0);
  const [nativeRevision, setNativeRevision] = useState(0);
  const [observing, setObserving] = useState(true);
  const [opening, setOpening] = useState(false);
  const [browserBusy, setBrowserBusy] = useState(false);
  const browserAdmission = useRef(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const confirm = useRef<HTMLDivElement>(null);
  const deviceElements = useRef(new Map<string, HTMLDivElement>());
  const returnDeviceFocus = useRef<string | null>(null);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  const refresh = useCallback(() => {
    setStatus(null);
    setReadError(null);
    setRevision((value) => value + 1);
  }, []);
  const changes = useNotificationChanges(ui, connection, refresh);
  const selected = ui.resource?.id ?? "";
  const pendingPreferenceId =
    changes.preferences && changes.preferences !== "unreadable"
      ? changes.preferences.requestId
      : changes.preferences;
  async function choose(ref: AgentRef) {
    if (!alive() || opening || conversationResource(ref).id === selected)
      return;
    setOpening(true);
    try {
      await ui.open({
        plugin: "notification-settings",
        view: "notifications",
        resource: conversationResource(ref),
      });
      ui.close();
    } catch (reason) {
      if (alive()) {
        setReadError(describeFailure(reason));
        setOpening(false);
      }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      requestSignal(ui.signal, connection),
      controller.signal,
    ]);
    setListing(null);
    setTarget(null);
    setStatus(null);
    setReadError(null);
    if (observing)
      void (async () => {
        const list = await connection.workbench.request(
          { op: "list" },
          { signal },
        );
        if (list.kind !== "list")
          throw new Error("获准 Conversation 清单未得到确认。");
        if (signal.aborted) return;
        setListing(list);
        if (!ui.resource) {
          const first =
            list.conversations.find(
              (ref) => ref.sessionId === connection.sessionId,
            ) ?? list.conversations[0];
          if (first) await choose(first);
          return;
        }
        const result = await connection.services.request(
          {
            op: "resource.resolve",
            reference: conversationReference(ui.resource),
          },
          { signal },
        );
        if (result.resolution.status !== "loaded")
          throw new Error(
            "此原 Conversation 当前不可用于通知设置，请先核对读取权限与加载状态。",
          );
        if (signal.aborted) return;
        const bound = result.resolution.target;
        setTarget(bound);
        const current = await connection.workbench.request(
          { op: "notification.status", target: bound },
          { signal },
        );
        if (current.kind !== "notification")
          throw new Error("通知当前设置未得到确认。");
        if (!signal.aborted) setStatus(current.status);
      })().catch((reason) => {
        if (!signal.aborted) setReadError(describeFailure(reason));
      });
    return () => controller.abort();
  }, [ui, connection, revision, observing]);
  useEffect(() => {
    setNative(null);
    if (!observing) return;
    let active = true;
    void nativeNotificationState()
      .then((value) => {
        if (active && alive()) setNative(value);
      })
      .catch((reason) => {
        if (active && alive())
          setBrowserError(describeNotificationBrowserFailure(reason));
      });
    return () => {
      active = false;
    };
  }, [ui, connection, revision, nativeRevision, observing]);
  useEffect(() => {
    const update = () => {
      if (alive() && document.visibilityState === "visible")
        setNativeRevision((value) => value + 1);
    };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [ui, connection]);
  useEffect(() => {
    if (!status || dirty.current) return;
    const original =
      changes.preferences && changes.preferences !== "unreadable"
        ? changes.preferences.original
        : null;
    setDraft(
      original?.op === "notification.preferences"
        ? { ...status.preferences, ...original.input.preferences }
        : status.preferences,
    );
  }, [status, pendingPreferenceId]);
  useLayoutEffect(() => {
    if (ui.signal.aborted) return;
    if (stopping) {
      confirm.current?.focus();
      confirm.current?.scrollIntoView({ block: "center" });
    } else if (returnDeviceFocus.current) {
      deviceElements.current
        .get(returnDeviceFocus.current)
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus();
      returnDeviceFocus.current = null;
    }
  }, [stopping, ui]);
  async function save() {
    if (!target || !draft || changes.preferencesBlocked()) return;
    if (
      await changes.send({
        op: "notification.preferences",
        target,
        input: { requestId: crypto.randomUUID(), preferences: draft },
      })
    )
      dirty.current = false;
  }
  async function browserAction(
    action: (signal: AbortSignal) => Promise<void>,
    success: string,
  ) {
    if (!alive() || browserAdmission.current) return;
    browserAdmission.current = true;
    setBrowserBusy(true);
    setBrowserError(null);
    setMessage(null);
    const signal = requestSignal(ui.signal, connection);
    try {
      await action(signal);
      signal.throwIfAborted();
      setMessage(success);
      setNativeRevision((value) => value + 1);
    } catch (reason) {
      if (alive()) setBrowserError(describeNotificationBrowserFailure(reason));
    } finally {
      browserAdmission.current = false;
      if (alive()) setBrowserBusy(false);
    }
  }
  function localCheck() {
    return browserAction(async (signal) => {
      const permission = await requestNotificationPermission();
      signal.throwIfAborted();
      if (permission !== "granted")
        throw new Error("系统通知尚未允许；请在浏览器网站设置中更改。");
      await notificationWorkerCommand("local-check", signal);
    }, "浏览器已接纳本地显示检查。请在系统通知区直接确认是否实际出现；这不是远端推送验收。");
  }
  function register() {
    if (!target || !status || changes.registrationBlocked(target)) return;
    const originalTarget = target,
      publicKey = status.publicKey;
    return browserAction(async (signal) => {
      const permission = await requestNotificationPermission();
      signal.throwIfAborted();
      if (permission !== "granted")
        throw new Error("系统通知尚未允许；本次没有登记。");
      const subscription = await subscribeBrowser(publicKey, signal);
      signal.throwIfAborted();
      await changes.send({
        op: "notification.subscribe",
        target: originalTarget,
        input: { requestId: crypto.randomUUID(), subscription },
      });
    }, "浏览器订阅步骤已完成。Pakka 登记结果须以原请求回执为准，不代表通知已实际送达。");
  }
  return (
    <section className="flow notification-settings">
      <header className="feature-heading">
        <div className="flow compact">
          <p className="eyebrow">SETTINGS</p>
          <h1>通知</h1>
        </div>
        <div className="actions">
          <Button
            label="刷新通知设置"
            variant="ghost"
            isDisabled={!observing}
            onClick={refresh}
          />
          <Button
            label={observing ? "暂停设置读取" : "恢复设置读取"}
            variant="ghost"
            onClick={() => setObserving((value) => !value)}
          />
        </div>
      </header>
      <p className="muted">
        偏好归当前人员；登记把本浏览器设备关联到所选
        Conversation。关闭页面或暂停读取不会停用设备，后台通知仍可继续。
      </p>
      {!observing ? (
        <p role="status">设置读取已暂停。</p>
      ) : (
        <>
          {readError && (
            <p className="error-text" role="alert">
              {readError}
            </p>
          )}
          {listing && (
            <Selector
              label="通知关联 Conversation"
              value={selected}
              options={listing.conversations.map((ref) => ({
                value: conversationResource(ref).id,
                label: `${listing.navigation?.find((row) => row.ref.sessionId === ref.sessionId && row.ref.conversationId === ref.conversationId)?.name ?? ref.key} · Session ${ref.sessionId.slice(0, 8)}`,
              }))}
              onChange={(id) => {
                const ref = listing.conversations.find(
                  (row) => conversationResource(row).id === id,
                );
                if (ref) void choose(ref);
              }}
              isDisabled={opening}
              presentation="adaptive"
              controlClassName="touch-control"
            />
          )}
          {listing && !listing.conversations.length && (
            <p>没有当前可读取且已加载的 Conversation。</p>
          )}
          {target && (
            <p className="muted identifier">
              Session {target.sessionId} · Conversation {target.conversationId}
            </p>
          )}
          {changes.error && (
            <p className="error-text" role="alert">
              {changes.error}
            </p>
          )}
          {changes.pending.map((entry) => (
            <div className="surface flow compact" key={entry.key}>
              {entry.value === "unreadable" ? (
                <p role="alert">
                  通知原请求记录无法解析；对应操作保持暂停，其他操作仍可独立进行。
                </p>
              ) : (
                <>
                  <h2>{actionLabel(entry.value.original.op)}待核对</h2>
                  <p className="muted">仅查询此原请求，不会重提修改。</p>
                  <p className="identifier">
                    请求 {entry.value.requestId}
                    {" · Session "}
                    {entry.value.original.target.sessionId}
                    {" · Conversation "}
                    {entry.value.original.target.conversationId}
                  </p>
                  <Button
                    label="核对原通知请求"
                    isDisabled={changes.busy.has(entry.key)}
                    onClick={() => {
                      const preference =
                        entry.value !== "unreadable" &&
                        entry.value.original.op === "notification.preferences";
                      void changes.reconcile(entry.key).then((done) => {
                        if (done && preference) dirty.current = false;
                      });
                    }}
                  />
                </>
              )}
            </div>
          ))}
          {status && draft && (
            <div className="surface flow">
              <h2>个人通知偏好</h2>
              <p className="muted">
                这些选择应用于你的已登记资源，不改变其他人员的偏好。
              </p>
              <div className="notification-options">
                {kinds.map(([kind, label]) => (
                  <label className="notification-option" key={kind}>
                    <input
                      type="checkbox"
                      checked={draft[kind]}
                      disabled={changes.preferencesBlocked()}
                      onChange={(event) => {
                        dirty.current = true;
                        setDraft((value) =>
                          value
                            ? { ...value, [kind]: event.target.checked }
                            : value,
                        );
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button
                label="保存通知偏好"
                isDisabled={changes.preferencesBlocked()}
                onClick={() => void save()}
              />
            </div>
          )}
          <div className="surface flow">
            <h2>本浏览器</h2>
            {browserError && (
              <p className="error-text" role="alert">
                {browserError}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            {native ? (
              <p>
                系统通知权限：{permissionLabel[native.permission]} ·
                浏览器推送订阅：{native.subscribed ? "已存在" : "未建立"}
              </p>
            ) : (
              <p role="status">正在读取浏览器通知状态…</p>
            )}
            <p className="muted">
              浏览器调用被接纳不等于系统已显示。系统勿扰、浏览器或操作系统设置可能拦截显示。远端推送还需要实际的推送网络。
            </p>
            <div className="actions">
              <Button
                label="检查系统通知显示"
                isDisabled={browserBusy || !native?.supported}
                onClick={() => void localCheck()}
              />
              <Button
                label="登记此 Conversation"
                isDisabled={
                  browserBusy ||
                  !native?.pushSupported ||
                  !target ||
                  !status ||
                  (!!target && changes.registrationBlocked(target))
                }
                onClick={() => void register()}
              />
              <Button
                label="清除已显示通知"
                variant="ghost"
                isDisabled={browserBusy || !native?.supported}
                onClick={() =>
                  void browserAction(
                    (signal) => notificationWorkerCommand("clear", signal),
                    "浏览器已确认清除 Pakka 已显示通知；设备登记没有改变。",
                  )
                }
              />
              <Button
                label="移除本浏览器推送订阅"
                variant="ghost"
                isDisabled={browserBusy || !native?.subscribed}
                onClick={() =>
                  void browserAction(
                    removeBrowserSubscription,
                    "浏览器已确认移除本地推送订阅；Pakka 设备登记仍须独立停用。",
                  )
                }
              />
            </div>
          </div>
          {status && (
            <div className="surface flow">
              <h2>此 Conversation 的已登记设备</h2>
              <p className="muted">
                停用设备会解除它在 Pakka
                登记的全部资源；不会替你移除浏览器原生订阅。此处是本次读取的当前设置，不是投递或系统显示回执。
              </p>
              {!status.devices.length && <p>此 Conversation 尚未登记设备。</p>}
              {status.devices.map((device) => (
                <div
                  className="notification-device flow compact"
                  key={device.id}
                  ref={(node) => {
                    if (node) deviceElements.current.set(device.id, node);
                    else deviceElements.current.delete(device.id);
                  }}
                >
                  <p>
                    {native?.subscriptionKey === device.subscriptionKey
                      ? "本浏览器设备"
                      : "另一已登记设备"}
                  </p>
                  <p className="identifier">{device.id}</p>
                  {stopping === device.id ? (
                    <div
                      className="flow compact"
                      role="group"
                      aria-label="确认停用通知设备"
                      tabIndex={-1}
                      ref={confirm}
                    >
                      <p>
                        将停用此设备在 Pakka
                        的全部通知资源。浏览器订阅不会自动删除。
                      </p>
                      <div className="actions">
                        <Button
                          label="确认停用设备"
                          isDisabled={changes.deviceBlocked(device.id)}
                          onClick={() => {
                            if (target)
                              void changes
                                .send({
                                  op: "notification.unsubscribe",
                                  target,
                                  input: {
                                    requestId: crypto.randomUUID(),
                                    deviceId: device.id,
                                  },
                                })
                                .then((done) => {
                                  if (done && alive()) setStopping(null);
                                });
                          }}
                        />
                        <Button
                          label="返回"
                          variant="ghost"
                          onClick={() => {
                            returnDeviceFocus.current = device.id;
                            setStopping(null);
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Button
                      label="停用设备"
                      variant="ghost"
                      isDisabled={changes.deviceBlocked(device.id)}
                      onClick={() => setStopping(device.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {changes.confirmed.length > 0 && (
            <div className="surface flow compact">
              <h2>原请求核对结果</h2>
              {changes.confirmed.map((result) => (
                <div
                  className="flow compact"
                  key={result.original.input.requestId}
                >
                  <p>{actionLabel(result.original.op)}请求已确认。</p>
                  <p className="muted identifier">
                    请求 {result.original.input.requestId}
                    {" · Conversation "}
                    {result.original.target.conversationId}
                  </p>
                  {result.original.op === "notification.preferences" && (
                    <p>
                      原回执偏好：
                      {kinds
                        .map(
                          ([kind, label]) =>
                            `${label} ${result.status.preferences[kind] ? "开" : "关"}`,
                        )
                        .join("、")}
                      。
                    </p>
                  )}
                </div>
              ))}
              <p className="muted">
                这是原操作当时的结果；后续修改后的设置另行读取，不由旧回执推断。
              </p>
            </div>
          )}
          {!status && target && !readError && (
            <p role="status">正在读取当前通知设置…</p>
          )}
        </>
      )}
    </section>
  );
}
