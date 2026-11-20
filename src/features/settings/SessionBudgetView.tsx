import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import type { UiViewProps } from "@pakka/webui-sdk";
import type { PocketClientResult } from "@pakka/client/pocket";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import { SessionBudgetPolicy } from "./SessionBudgetPolicy.js";

type Sessions = Extract<PocketClientResult, { kind: "sessions" }>;
export function SessionBudgetView({
  ui,
  bindings,
}: UiViewProps<PakkaConnection>) {
  const [sessions, setSessions] = useState<Sessions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [opening, setOpening] = useState(false);
  const selected =
    ui.resource?.source === "pakka" && ui.resource.type === "session"
      ? ui.resource.id
      : "";
  async function choose(id: string) {
    if (
      opening ||
      ui.signal.aborted ||
      bindings.signal.aborted ||
      id === selected
    )
      return;
    setOpening(true);
    try {
      await ui.open({
        plugin: "session-settings",
        view: "budget",
        resource: { source: "pakka", type: "session", id },
      });
      ui.close();
    } catch (reason) {
      if (!ui.signal.aborted && !bindings.signal.aborted) {
        setError(describeFailure(reason));
        setOpening(false);
      }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      requestSignal(ui.signal, bindings),
      controller.signal,
    ]);
    setSessions(null);
    setError(null);
    void bindings.workbench
      .request({ op: "session.list" }, { signal })
      .then((result) => {
        if (result.kind !== "sessions")
          throw new Error("Session 清单未得到确认。");
        if (signal.aborted) return;
        setSessions(result);
        if (!ui.resource) {
          const first = result.sessions.find((row) => row.status === "ready");
          if (first) void choose(first.id);
        }
      })
      .catch((reason) => {
        if (!signal.aborted) setError(describeFailure(reason));
      });
    return () => controller.abort();
  }, [ui, bindings, refresh]);
  const current = sessions?.sessions.find((row) => row.id === selected);
  return (
    <section className="flow">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>Session 预算</h1>
        </div>
        <Button
          label="刷新 Session 清单"
          variant="ghost"
          onClick={() => setRefresh((value) => value + 1)}
        />
      </header>
      <p className="muted">
        每个 Session 独立管理 Conversation
        数量、主要推理和辅助推理尝试次数。调整上限保留已消耗次数；已接纳、取消或结果未知的尝试不会因修改预算退回。
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {!sessions && !error && <p role="status">正在读取 Session…</p>}
      {sessions && (
        <Selector
          label="预算所属 Session"
          value={selected}
          options={sessions.sessions.map((row) => ({
            value: row.id,
            label: `${row.name} · ${row.id}`,
          }))}
          onChange={(id) => void choose(id)}
          isDisabled={opening}
          presentation="adaptive"
          controlClassName="touch-control"
        />
      )}
      {sessions && ui.resource && !current && (
        <p role="status">原 Session 当前不可得或无权访问，请核对所选引用。</p>
      )}
      {current && (
        <>
          <p className="identifier">Session {current.id}</p>
          {current.status === "ready" ? (
            <SessionBudgetPolicy
              key={current.id}
              ui={ui}
              connection={bindings}
              sessionId={current.id}
            />
          ) : (
            <p role="status">
              此 Session 当前不可管理。可在工作台核对原 Session 状态。
            </p>
          )}
        </>
      )}
    </section>
  );
}
