import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { PocketRemoteError, type AgentRef } from "@pakka/client/pocket";
import { decodeTarget } from "@pakka/protocol/extension-rpc";
import type { ConversationInputHistory } from "@pakka/protocol/webui";
import type { UiContext } from "@pakka/webui-sdk";
import {
  claimPending,
  clearPending,
  readPending,
} from "../../integrations/pakka/pending.js";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

type Control = {
  requestId: string;
  target: AgentRef;
  op: "abort" | "withdraw";
  id?: string;
};
function decodeControl(value: unknown): Control {
  if (
    !value ||
    typeof value !== "object" ||
    !("requestId" in value) ||
    typeof value.requestId !== "string" ||
    !("target" in value) ||
    !("op" in value) ||
    !["abort", "withdraw"].includes(String(value.op))
  )
    throw new Error("原控制请求不可读。");
  decodeTarget(value.target);
  if (
    value.op === "withdraw" &&
    (!("id" in value) || typeof value.id !== "string" || !value.id)
  )
    throw new Error("原回执不可读。");
  return value as Control;
}
import { ReadingIcon } from "./ReadingIcons.js";
import { inputModeLabel, inputStatus } from "./input-labels.js";

/** Server-owned receipts; a lost mutation response only leads to observation. */
export function InputActivity({
  ui,
  connection,
  target,
  running,
  revision,
  page,
  setPage,
  disabled,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  target: AgentRef;
  running: boolean;
  revision: number;
  page: ConversationInputHistory | null;
  setPage(page: ConversationInputHistory | null): void;
  disabled: boolean;
}) {
  const key = JSON.stringify([
    "pakka-input-control",
    connection.origin,
    connection.person.id,
    target.sessionId,
    target.conversationId,
  ]);
  const [pending, setPending] = useState<Control | "unreadable" | null>(() =>
    readPending(key, decodeControl),
  );
  const [cursor, setCursor] = useState<string | undefined>();
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [expanded, setExpanded] = useState(() => pending !== null);
  const detailsId = useId();
  useEffect(() => {
    if (pending || error || notice) setExpanded(true);
  }, [pending, error, notice]);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, connection),
    ]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (disabled) {
      setPage(null);
      return () => controller.abort();
    }
    const read = async () => {
      setReading(true);
      try {
        const value = await connection.services.request(
          { op: "input.history", target, ...(cursor ? { cursor } : {}) },
          { signal },
        );
        if (signal.aborted) return;
        setPage(value.page);
        setError(null);
        if (
          running ||
          value.page.items.some(
            ({ receipt }) =>
              receipt.status === "queued" || receipt.status === "placed",
          )
        )
          timer = setTimeout(() => {
            void read();
          }, 1500);
      } catch (reason) {
        if (!signal.aborted) {
          setPage(null);
          setError(describeFailure(reason));
        }
      } finally {
        if (!signal.aborted) setReading(false);
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    ui,
    connection,
    target,
    running,
    revision,
    refresh,
    cursor,
    disabled,
    setPage,
  ]);
  async function control(op: Control["op"], id?: string) {
    if (admission.current || !alive() || disabled) return;
    const original: Control = {
      requestId: crypto.randomUUID(),
      target,
      op,
      ...(id ? { id } : {}),
    };
    admission.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const reserved = claimPending(key, original, decodeControl);
      setPending(reserved);
      if (
        reserved === "unreadable" ||
        reserved.requestId !== original.requestId
      )
        return;
      const command =
        op === "abort"
          ? { op, target }
          : { op, id: id!, sessionId: target.sessionId };
      const result = await connection.workbench.request(command, {
        signal: requestSignal(ui.signal, connection),
        requestId: original.requestId,
      });
      if (op === "abort" && result.kind !== "updated")
        throw new Error("停止结果未得到确认。");
      if (op === "withdraw") {
        if (result.kind !== "receipt" || result.receipt.id !== id)
          throw new Error("撤回结果未得到确认。");
        if (result.receipt.status === "unknown")
          throw new Error("原输入仍是未知结果，请核对回执。");
      }
      const remaining = clearPending(key, original.requestId, decodeControl);
      if (alive()) {
        setPending(remaining);
        setNotice(
          op === "abort"
            ? "停止操作已返回；请核对活动和各输入回执。"
            : "已取得原输入的最新回执。",
        );
        setRefresh((value) => value + 1);
      }
    } catch (reason) {
      if (reason instanceof PocketRemoteError && reason.outcome === "denied")
        try {
          const remaining = clearPending(
            key,
            original.requestId,
            decodeControl,
          );
          if (alive()) setPending(remaining);
        } catch {
          /* Preserve the original. */
        }
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function check() {
    const original = readPending(key, decodeControl);
    setPending(original);
    if (!original || original === "unreadable" || admission.current || !alive())
      return;
    admission.current = true;
    setBusy(true);
    setError(null);
    try {
      if (original.op === "withdraw" && original.id) {
        const result = await connection.workbench.request(
          {
            op: "receipt",
            id: original.id,
            sessionId: original.target.sessionId,
          },
          { signal: requestSignal(ui.signal, connection) },
        );
        if (result.kind !== "receipt") throw new Error("未收到原回执。");
        if (
          result.receipt.status === "done" ||
          result.receipt.status === "unanswered"
        ) {
          const remaining = clearPending(
            key,
            original.requestId,
            decodeControl,
          );
          if (alive()) {
            setPending(remaining);
            setNotice(
              `原输入已结束：${inputStatus[result.receipt.status]}。未重复撤回。`,
            );
          }
        } else if (alive())
          setNotice(
            `原输入为${inputStatus[result.receipt.status]}，控制结果仍需核对。`,
          );
      } else if (alive())
        setNotice(
          "停止请求的结果仍未知；当前活动与输入回执仅供观察，不确认此前停止的效果。",
        );
      if (alive()) setRefresh((value) => value + 1);
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return (
    <section className="input-activity" aria-label="我的输入回执">
      <header className="input-activity-bar">
        <button
          type="button"
          className="input-summary"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d={expanded ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4"} />
          </svg>
          <span>我的输入</span>
          <span className="input-summary-status">
            {pending
              ? "控制请求待核对"
              : page?.items[0]
                ? inputStatus[page.items[0].receipt.status]
                : reading
                  ? "正在读取…"
                  : "当前清单暂无输入"}
          </span>
        </button>
        <div className="actions">
          <button
            className="reader-action"
            type="button"
            disabled={reading || disabled}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <ReadingIcon name="refresh" />
            刷新输入状态
          </button>
          {running && connection.person.role === "admin" && (
            <Button
              label="停止当前工作"
              variant="ghost"
              isDisabled={disabled || busy || !!pending}
              onClick={() => {
                void control("abort");
              }}
            />
          )}
        </div>
      </header>
      <div
        className="input-activity-body flow"
        id={detailsId}
        hidden={!expanded}
      >
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {pending && (
          <div className="flow compact">
            <p>
              {pending === "unreadable"
                ? "本地控制记录不可读；请保留原记录。"
                : `控制请求 ${pending.requestId} 尚未确认。`}
            </p>
            <Button
              label="核对控制结果"
              variant="ghost"
              isDisabled={busy || pending === "unreadable" || disabled}
              onClick={() => {
                void check();
              }}
            />
          </div>
        )}
        {page && !page.items.length && (
          <p className="muted">当前没有你的已接纳输入。</p>
        )}
        {page?.items.map((item) => (
          <article className="flow compact" key={item.receipt.id}>
            <header>
              {inputModeLabel[item.mode]} · {inputStatus[item.receipt.status]}
              {item.receipt.reason ? ` · ${item.receipt.reason}` : ""}
            </header>
            <p className="message-text">
              {item.preview}
              {item.truncated ? "（预览）" : ""}
            </p>
            {item.receipt.status === "queued" &&
              connection.person.role !== "viewer" && (
                <Button
                  label="撤回此输入"
                  variant="ghost"
                  isDisabled={disabled || busy || !!pending}
                  onClick={() => {
                    void control("withdraw", item.receipt.id);
                  }}
                />
              )}
          </article>
        ))}
        <div className="actions">
          <Button
            label="最近输入"
            variant="ghost"
            isDisabled={!cursor || reading}
            onClick={() => setCursor(undefined)}
          />
          <Button
            label="更早输入"
            variant="ghost"
            isDisabled={!page?.nextCursor || reading}
            onClick={() => setCursor(page?.nextCursor)}
          />
        </div>
      </div>
    </section>
  );
}
