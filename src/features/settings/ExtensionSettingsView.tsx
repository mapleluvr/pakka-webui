import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import type { UiViewProps } from "@pakka/webui-sdk";
import type {
  ExtensionFacet,
  ExtensionFacetControl,
  ExtensionRegistration,
} from "@pakka/protocol/extensions";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import {
  pendingFacetIdentities,
  useFacetControl,
  type FacetIdentity,
} from "./useFacetControl.js";

export interface ExtensionSettingsBindings {
  readonly connection: PakkaConnection;
  synchronize(): Promise<void>;
}
const facets: readonly ExtensionFacet[] = [
  "backend",
  "agent",
  "webui",
  "client",
];
const names: Record<ExtensionFacet, string> = {
  backend: "Backend",
  agent: "Agent",
  webui: "WebUI",
  client: "Client",
};
const phases = { ready: "已启用", disabled: "已停用", unknown: "状态未知" };
const actions: Record<ExtensionFacetControl["action"], string> = {
  enable: "启用",
  disable: "停用",
  reload: "重新装载",
};
const explanations: Record<ExtensionFacet, string> = {
  backend:
    "控制此扩展接纳新服务调用的资格。已接纳的工作和历史由原服务继续管理。",
  agent:
    "控制获准 Agent preset 中后续可用的工具与指令。已接纳的工具工作保留自己的生命周期。",
  webui: "控制此扩展的界面发布。停用或重新装载会关闭它的已打开页面并清理实例。",
  client: "控制此扩展的客户端装载资格。已经交付给浏览器的代码仍存在于接收端。",
};
interface FacetItem extends FacetIdentity {
  readonly registration?: ExtensionRegistration;
}

function FacetCard({
  item,
  ui,
  bindings,
  refresh,
}: UiViewProps<ExtensionSettingsBindings> & {
  item: FacetItem;
  refresh(): Promise<void>;
}) {
  const { connection } = bindings;
  const control = useFacetControl(ui, connection, item, refresh);
  const [action, setAction] = useState<ExtensionFacetControl["action"] | null>(
    null,
  );
  const [displayPending, setDisplayPending] = useState(false);
  const registration = item.registration;
  const pending =
    control.pending && control.pending !== "unreadable"
      ? control.pending
      : null;
  const label = names[item.facet];
  const open = action !== null || displayPending;
  const selected = pending?.action ?? action;
  async function apply() {
    const done = await control.run(
      pending
        ? undefined
        : action && registration
          ? { action, registration }
          : undefined,
    );
    if (done && !ui.signal.aborted && !connection.signal.aborted) {
      setAction(null);
      setDisplayPending(false);
    }
  }
  return (
    <section
      className="surface flow compact"
      aria-label={`${item.extension} ${label}`}
    >
      <div className="feature-heading">
        <h2>{label}</h2>
        <span role="status">
          {registration ? phases[registration.phase] : "当前未发现"}
        </span>
      </div>
      <p className="muted">{explanations[item.facet]}</p>
      {registration && (
        <div className="actions">
          <Button
            label={`${registration.phase === "disabled" ? "启用" : "停用"} ${item.extension} ${label}`}
            isDisabled={control.busy || !!control.pending}
            onClick={() =>
              setAction(
                registration.phase === "disabled" ? "enable" : "disable",
              )
            }
          >
            {registration.phase === "disabled" ? "启用" : "停用"}
          </Button>
          <Button
            label={`重新装载 ${item.extension} ${label}`}
            variant="ghost"
            isDisabled={control.busy || !!control.pending}
            onClick={() => setAction("reload")}
          >
            重新装载
          </Button>
        </div>
      )}
      {control.pending && (
        <div className="flow compact" role="status">
          {control.pending === "unreadable" ? (
            <p>此 facet 的本地原请求不可读，已阻止继续控制。请保留原记录。</p>
          ) : (
            <>
              <p className="identifier">
                待核对：{actions[control.pending.action]}
                {" · "}
                {control.pending.requestId}
              </p>
              <Button
                label={`核对 ${item.extension} ${label} 原请求`}
                variant="ghost"
                isDisabled={control.busy}
                onClick={() => {
                  setAction(null);
                  setDisplayPending(true);
                }}
              >
                核对原请求
              </Button>
            </>
          )}
        </div>
      )}
      {control.receipt?.state === "done" && (
        <p role="status">
          原控制已确认：{actions[control.receipt.action]}
          。该回执记录当时的结果。
        </p>
      )}
      {control.error && (
        <p role="alert" className="error-text">
          {control.error}
        </p>
      )}
      <details>
        <summary>版本与身份</summary>
        <p className="identifier">
          {item.extension} · {label}
        </p>
        {registration && (
          <>
            <p>版本 {registration.manifest.version}</p>
            <p className="identifier">generation：{registration.generation}</p>
          </>
        )}
      </details>
      <Dialog
        isOpen={open}
        onOpenChange={(value) => {
          if (!value) {
            setAction(null);
            setDisplayPending(false);
          }
        }}
        aria-label={`${selected ? actions[selected] : "核对"} ${label}`}
        width="min(560px, calc(100vw - 32px))"
      >
        {open && (
          <Layout
            header={
              <LayoutHeader>
                <h1>
                  {pending
                    ? "核对原控制"
                    : selected
                      ? `${actions[selected]} ${label}`
                      : "控制 facet"}
                </h1>
              </LayoutHeader>
            }
            content={
              <LayoutContent label="扩展控制说明">
                <div className="flow">
                  <p>{registration?.manifest.title ?? item.extension}</p>
                  <p className="muted identifier">
                    {item.extension} · {label}
                  </p>
                  <p>{explanations[item.facet]}</p>
                  {pending ? (
                    <p className="identifier">
                      原请求：{pending.requestId} · {actions[pending.action]}
                      。此处只查询原结果。
                    </p>
                  ) : (
                    <p>
                      使用当前读取到的版本与 generation
                      提交；若它已变化，服务将拒绝本次控制。
                    </p>
                  )}
                  {registration?.phase === "unknown" && (
                    <p role="status">
                      此 facet
                      有未确认的初始化或清理结果，后续操作由服务继续核对。
                    </p>
                  )}
                  {control.error && (
                    <p role="alert" className="error-text">
                      {control.error}
                    </p>
                  )}
                </div>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <div className="actions">
                  <Button
                    label={
                      control.busy
                        ? "正在核对…"
                        : pending
                          ? "查询原控制回执"
                          : "确认控制"
                    }
                    isDisabled={
                      control.busy ||
                      control.pending === "unreadable" ||
                      (!pending && !registration)
                    }
                    onClick={() => {
                      void apply();
                    }}
                  />
                  <Button
                    label="关闭"
                    variant="ghost"
                    onClick={() => {
                      setAction(null);
                      setDisplayPending(false);
                    }}
                  />
                </div>
              </LayoutFooter>
            }
          />
        )}
      </Dialog>
    </section>
  );
}

export function ExtensionSettingsView(
  props: UiViewProps<ExtensionSettingsBindings>,
) {
  const { ui, bindings } = props,
    { connection } = bindings;
  const [items, setItems] = useState<readonly FacetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  const revision = useRef(0);
  async function refresh(synchronize = true) {
    const read = ++revision.current;
    setLoading(true);
    setError(null);
    const signal = requestSignal(ui.signal, connection);
    try {
      if (synchronize) await bindings.synchronize();
      const rows = await connection.extensions.list(undefined, { signal });
      signal.throwIfAborted();
      const known = new Map<string, FacetItem>();
      for (const row of rows)
        known.set(JSON.stringify([row.manifest.id, row.facet]), {
          extension: row.manifest.id,
          facet: row.facet,
          registration: row,
        });
      for (const identity of pendingFacetIdentities(connection)) {
        const key = JSON.stringify([identity.extension, identity.facet]);
        if (!known.has(key)) known.set(key, identity);
      }
      if (read === revision.current) {
        setItems([...known.values()]);
        setReadAt(Date.now());
      }
    } catch (reason) {
      if (!signal.aborted && read === revision.current)
        setError(describeFailure(reason));
    } finally {
      if (!signal.aborted && read === revision.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh(false);
    return () => {
      revision.current++;
    };
  }, [connection, ui]);
  const extensions = [...new Set(items.map((item) => item.extension))].sort();
  return (
    <div className="flow">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>扩展与 facets</h1>
        </div>
        <Button
          label={loading ? "正在读取扩展…" : "刷新扩展状态"}
          isDisabled={loading}
          onClick={() => {
            void refresh();
          }}
        />
      </div>
      <p className="muted">
        分别控制可信宿主已批准的扩展能力。配置范围为当前 Pakka 实例。
      </p>
      {readAt !== null && (
        <p className="muted">
          状态读取于 {new Date(readAt).toLocaleTimeString()}。
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {!loading && !items.length && !error && <p>当前没有已批准的扩展。</p>}
      {extensions.map((extension) => {
        const members = items.filter((item) => item.extension === extension);
        return (
          <section
            key={extension}
            className="flow"
            aria-label={`扩展 ${extension}`}
          >
            <div>
              <h2>
                {members.find((item) => item.registration)?.registration
                  ?.manifest.title ?? extension}
              </h2>
              <p className="muted identifier">{extension}</p>
            </div>
            <div className="form-grid">
              {[...members]
                .sort(
                  (a, b) => facets.indexOf(a.facet) - facets.indexOf(b.facet),
                )
                .map((item) => (
                  <FacetCard
                    key={JSON.stringify([extension, item.facet])}
                    {...props}
                    item={item}
                    refresh={() => refresh()}
                  />
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
