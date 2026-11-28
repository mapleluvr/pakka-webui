import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import {
  ConversationPanel,
  useConversationPanelTrigger,
} from "./ConversationPanel.js";
import { InputReceiptRow } from "./InputReceiptRow.js";
import { createPortal } from "react-dom";
import { ComposerIcon } from "./ComposerIcons.js";
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

import { ReadingIcon } from "./ReadingIcons.js";
import { inputStatus } from "./input-labels.js";

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
  stopTarget,
}: {
  stopTarget: HTMLElement | null;
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
  const [readError, setReadError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [expanded, setExpanded] = useState(() => pending !== null);
  const detailsId = useId();
  const historyTrigger = useConversationPanelTrigger(
    "history",
    expanded,
    () => setExpanded(true),
    () => setExpanded(false),
  );
  useEffect(() => {
    if (!busy && (pending || error || readError)) setExpanded(true);
  }, [pending, error, readError, busy]);
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
      setReading(false);
      setReadError(null);
      return () => controller.abort();
    }
    const read = async () => {
      setReading(true);
      setReadError(null);
      try {
        const value = await connection.services.request(
          { op: "input.history", target, ...(cursor ? { cursor } : {}) },
          { signal },
        );
        if (signal.aborted) return;
        setPage(value.page);
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
          setReadError(describeFailure(reason));
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
      {running &&
        stopTarget &&
        createPortal(
          <button
            type="button"
            className="composer-primary"
            aria-label="停止当前工作"
            title="停止当前工作"
            disabled={
              disabled ||
              busy ||
              !!pending ||
              connection.person.role !== "admin"
            }
            onClick={() => {
              void control("abort");
            }}
          >
            <ComposerIcon name="stop" />
          </button>,
          stopTarget,
        )}
      <button
        type="button"
        className="input-summary"
        ref={trigger}
        aria-label="我的输入"
        title={pending ? "我的输入 · 控制请求待核对" : "我的输入"}
        aria-controls={expanded ? detailsId : undefined}
        {...historyTrigger}
      >
        <ComposerIcon name="history" />
      </button>
      {expanded && (
        <ConversationPanel
          kind="history"
          id={detailsId}
          title="我的输入"
          trigger={trigger}
          onClose={() => setExpanded(false)}
          actions={
            <button
              type="button"
              className="reader-action input-refresh"
              aria-label="刷新输入状态"
              aria-busy={reading}
              aria-disabled={reading || disabled}
              title={reading ? "正在刷新输入清单…" : "刷新输入状态"}
              onClick={() => {
                if (!reading && !disabled) setRefresh((value) => value + 1);
              }}
            >
              <ReadingIcon name={reading ? "processing" : "refresh"} />
            </button>
          }
          footer={
            (cursor || page?.nextCursor) && (
              <>
                {cursor && (
                  <Button
                    label="最近输入"
                    variant="ghost"
                    isDisabled={reading || disabled}
                    onClick={() => setCursor(undefined)}
                  />
                )}
                {page?.nextCursor && (
                  <Button
                    label="更早输入"
                    variant="ghost"
                    isDisabled={reading || disabled}
                    onClick={() => setCursor(page.nextCursor)}
                  />
                )}
              </>
            )
          }
        >
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {pending && (
            <div className="input-pending-control">
              <p>
                {pending === "unreadable"
                  ? "本地控制记录不可读；请保留原记录。"
                  : "原控制请求仍待核对，请勿重复操作。"}
              </p>
              {pending !== "unreadable" && (
                <details className="panel-details">
                  <summary>控制请求详情</summary>
                  <dl>
                    <dt>操作</dt>
                    <dd>
                      {pending.op === "abort" ? "停止当前工作" : "撤回此输入"}
                    </dd>
                    <dt>原请求</dt>
                    <dd>{pending.requestId}</dd>
                    {pending.id && (
                      <>
                        <dt>输入回执</dt>
                        <dd>{pending.id}</dd>
                      </>
                    )}
                  </dl>
                </details>
              )}
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
          {readError && (
            <p role="alert" className="error-text">
              输入清单读取失败：{readError}
            </p>
          )}
          {!page && !readError && (
            <p className="input-list-state">
              {disabled ? "当前无法读取输入清单。" : "正在读取输入清单…"}
            </p>
          )}
          {page && reading && (
            <span className="visually-hidden">正在刷新输入清单…</span>
          )}
          {page && !page.items.length && (
            <p className="input-list-state">当前没有你的已接纳输入。</p>
          )}
          {page && page.items.length > 0 && (
            <ol className="input-receipts" aria-label="输入记录">
              {page.items.map((item) => (
                <InputReceiptRow
                  key={item.receipt.id}
                  item={item}
                  disabled={disabled || busy || !!pending}
                  onWithdraw={
                    item.receipt.status === "queued" &&
                    connection.person.role !== "viewer"
                      ? () => {
                          void control("withdraw", item.receipt.id);
                        }
                      : undefined
                  }
                />
              ))}
            </ol>
          )}
        </ConversationPanel>
      )}
    </section>
  );
}
