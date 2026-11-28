import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { PocketRemoteError } from "@pakka/client/pocket";
import type { UiContext } from "@pakka/webui-sdk";
import {
  decodeSessionBudgetChange,
  matchesSessionBudgetReceipt,
  type SessionBudgetChange,
  type SessionBudgetLimits,
  type SessionBudgetSnapshot,
  type SessionBudgetReceipt,
  type SessionBudgetPage,
} from "@pakka/protocol/webui";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import {
  claimPending,
  clearPending,
  readPending,
} from "../../integrations/pakka/pending.js";

const fields = [
  { key: "maxConversations", label: "Conversation 数量上限" },
  { key: "maxPrimaryAttempts", label: "主要推理尝试上限" },
  { key: "maxAuxiliaryAttempts", label: "辅助推理尝试上限" },
] as const;
type Draft = {
  version: number;
  limits: Record<keyof SessionBudgetLimits, string>;
  reason: string;
};
const values = (limits: SessionBudgetLimits): Draft["limits"] => ({
  maxConversations: String(limits.maxConversations),
  maxPrimaryAttempts: String(limits.maxPrimaryAttempts),
  maxAuxiliaryAttempts: String(limits.maxAuxiliaryAttempts),
});
const displayLimit = (limit: number) =>
  limit === 0 ? "不限制" : String(limit);
export function SessionBudgetPolicy({
  ui,
  connection,
  sessionId,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  sessionId: string;
}) {
  const key = JSON.stringify([
    connection.origin,
    connection.person.id,
    "session-budget",
    sessionId,
  ]);
  const restore = () => readPending(key, decodeSessionBudgetChange);
  const [lifetime] = useState(() => new AbortController());
  const signal = () =>
    AbortSignal.any([requestSignal(ui.signal, connection), lifetime.signal]);
  const alive = () =>
    !lifetime.signal.aborted &&
    !ui.signal.aborted &&
    !connection.signal.aborted;
  const [policy, setPolicy] = useState<SessionBudgetSnapshot | null>(null);
  const [page, setPage] = useState<SessionBudgetPage | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(restore);
  const [receipt, setReceipt] = useState<SessionBudgetReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const admission = useRef(false);
  async function read() {
    const [current, history] = await Promise.all([
      connection.services.request(
        { op: "session-budget.read", sessionId },
        { signal: signal() },
      ),
      connection.services.request(
        { op: "session-budget.history", sessionId, limit: 16 },
        { signal: signal() },
      ),
    ]);
    if (!alive()) return;
    const original = restore();
    setPending(original);
    setPolicy(current.policy);
    setPage(history.page);
    setDraft(
      original && original !== "unreadable"
        ? {
            version: original.expectedVersion,
            limits: values(original.limits),
            reason: original.reason,
          }
        : {
            version: current.policy.version,
            limits: values(current.policy.limits),
            reason: "",
          },
    );
  }
  useEffect(() => {
    void read().catch((reason) => {
      if (alive()) setError(describeFailure(reason));
    });
    return () => lifetime.abort();
  }, [ui, connection, sessionId, lifetime]);
  function release(requestId: string) {
    const remaining = clearPending(key, requestId, decodeSessionBudgetChange);
    if (alive()) setPending(remaining);
  }
  async function accept(
    value: SessionBudgetReceipt,
    original: SessionBudgetChange,
  ) {
    if (!matchesSessionBudgetReceipt(value, original, connection.person.id))
      throw new Error("预算原请求与回执不匹配，继续保留待核对状态。");
    release(original.requestId);
    if (!alive()) return;
    setReceipt(value);
    setMessage(`原请求已确认：预算版本 ${value.version}，已消耗次数保留。`);
    try {
      await read();
    } catch (reason) {
      if (alive())
        setError(`保存已确认，读取当前预算失败。${describeFailure(reason)}`);
    }
  }
  async function save() {
    if (!draft || admission.current || !alive()) return;
    admission.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    let sent: SessionBudgetChange | null = null;
    try {
      const parsed = Object.fromEntries(
        fields.map(({ key }) => {
          const text = draft.limits[key].trim();
          if (!/^(0|[1-9][0-9]*)$/.test(text))
            throw new Error("各项上限须填写非负整数；0 表示不限制。");
          return [key, Number(text)];
        }),
      );
      const change = decodeSessionBudgetChange({
        requestId: crypto.randomUUID(),
        expectedVersion: draft.version,
        limits: parsed,
        reason: draft.reason.trim(),
      });
      const reserved = claimPending(key, change, decodeSessionBudgetChange);
      setPending(reserved);
      if (
        reserved === "unreadable" ||
        reserved.requestId !== change.requestId
      ) {
        setError("此 Session 有原请求尚未确认，请先核对；本次修改未提交。");
        return;
      }
      sent = change;
      const result = await connection.services.request(
        { op: "session-budget.write", sessionId, change },
        { signal: signal() },
      );
      await accept(result.receipt, change);
    } catch (reason) {
      if (
        sent &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        try {
          release(sent.requestId);
        } catch {
          /* Storage failure keeps the operation uncertain. */
        }
      }
      if (alive())
        setError(
          reason instanceof PocketRemoteError && reason.code === "CONFLICT"
            ? "预算版本已变化，本次修改被拒绝。草稿保留；请刷新并核对当前预算后重新填写。"
            : describeFailure(reason),
        );
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function lookup() {
    if (admission.current || !alive()) return;
    const original = restore();
    setPending(original);
    if (!original || original === "unreadable") return;
    admission.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await connection.services.request(
        { op: "session-budget.lookup", sessionId, original },
        { signal: signal() },
      );
      if (result.receipt) await accept(result.receipt, original);
      else if (alive())
        setMessage("尚未找到原请求的回执，结果仍未知；未重新提交。");
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function refresh(beforeVersion?: number) {
    if (admission.current || !alive()) return;
    admission.current = true;
    setBusy(true);
    setError(null);
    try {
      if (beforeVersion === undefined) await read();
      else {
        const result = await connection.services.request(
          { op: "session-budget.history", sessionId, limit: 16, beforeVersion },
          { signal: signal() },
        );
        if (alive()) setPage(result.page);
      }
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  const blocked = busy || !!pending;
  return (
    <div className="flow">
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {pending && (
        <section className="surface flow" aria-label="预算待核对请求">
          <p>
            {pending === "unreadable"
              ? "本地原请求无法读取，已阻止继续写入。请由管理员核对原操作。"
              : "原请求已保留。先核对结果，当前不能重复保存。"}
          </p>
          {pending !== "unreadable" && (
            <>
              <code className="resource-id">{pending.requestId}</code>
              <Button
                label="核对预算原请求"
                isDisabled={busy}
                onClick={() => void lookup()}
              />
            </>
          )}
        </section>
      )}
      <div className="actions">
        <Button
          label={busy ? "正在读取或提交…" : "刷新预算与记录"}
          variant="ghost"
          isDisabled={busy}
          onClick={() => void refresh()}
        />
      </div>
      {policy && (
        <section className="surface flow" aria-label="当前 Session 预算">
          <h2>当前预算 · 版本 {policy.version}</h2>
          <dl className="resource-meta">
            <div>
              <dt>Conversation 数量</dt>
              <dd>
                {policy.conversationCount} /{" "}
                {displayLimit(policy.limits.maxConversations)}
              </dd>
            </div>
            <div>
              <dt>已消耗主要推理尝试</dt>
              <dd>
                {policy.budget.primaryAttempts}
                {" / "}
                {displayLimit(policy.limits.maxPrimaryAttempts)}
              </dd>
            </div>
            <div>
              <dt>已消耗辅助推理尝试</dt>
              <dd>
                {policy.budget.auxiliaryAttempts}
                {" / "}
                {displayLimit(policy.limits.maxAuxiliaryAttempts)}
              </dd>
            </div>
          </dl>
        </section>
      )}
      {draft && (
        <form
          className="surface flow"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2>调整上限</h2>
          <p className="muted">
            按版本 {draft.version}
            {
              " 提交。0 表示不限制该项。降低正数上限不会取消已接纳工作，超出额度时后续接纳会被拒绝。"
            }
          </p>
          {fields.map(({ key, label }) => (
            <TextInput
              key={key}
              label={label}
              value={draft.limits[key]}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  limits: { ...draft.limits, [key]: value },
                })
              }
              inputMode="numeric"
              autoComplete="off"
              isDisabled={blocked}
              controlClassName="touch-control"
            />
          ))}
          <TextInput
            label="备注（可选）"
            value={draft.reason}
            onChange={(reason) => setDraft({ ...draft, reason })}
            isDisabled={blocked}
            autoComplete="off"
            controlClassName="touch-control"
          />
          <div>
            <Button label="保存预算" type="submit" isDisabled={blocked} />
          </div>
        </form>
      )}
      {receipt && (
        <details>
          <summary>最近保存详情</summary>
          <code className="resource-id">{receipt.requestId}</code>
        </details>
      )}
      {page && (
        <section className="surface flow" aria-label="预算修改记录">
          <h2>修改记录</h2>
          {page.items.length === 0 && <p>此页没有预算修改记录。</p>}
          <ol className="resource-list">
            {page.items.map((row) => (
              <li key={row.version}>
                <div className="flow">
                  <strong>{new Date(row.at).toLocaleString()}</strong>
                  {row.reason && <p>{row.reason}</p>}
                  <p>
                    Conversation：{displayLimit(row.before.maxConversations)} →{" "}
                    {displayLimit(row.after.maxConversations)}
                    ；主要推理：{displayLimit(
                      row.before.maxPrimaryAttempts,
                    )} → {displayLimit(row.after.maxPrimaryAttempts)}
                    ；辅助推理：{displayLimit(
                      row.before.maxAuxiliaryAttempts,
                    )}{" "}
                    → {displayLimit(row.after.maxAuxiliaryAttempts)}。
                  </p>
                  <details>
                    <summary>记录详情</summary>
                    <p className="muted">
                      版本 {row.version} ·{" "}
                      {row.source === "bootstrap" ? "启动配置" : "管理修改"} ·
                      操作者 {row.actorId}
                    </p>
                    <p className="identifier">请求 {row.requestId}</p>
                    <p className="muted">
                      当时已消耗：主要 {row.budget.primaryAttempts} 次，辅助{" "}
                      {row.budget.auxiliaryAttempts} 次。
                    </p>
                  </details>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <Button
              label="更早预算记录"
              variant="ghost"
              isDisabled={busy || page.nextBeforeVersion === undefined}
              onClick={() => void refresh(page.nextBeforeVersion)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
