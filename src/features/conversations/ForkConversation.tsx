import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import type { AgentRef } from "@pakka/protocol/pocket";
import type { UiContext } from "@pakka/webui-sdk";
import type { PocketClientResult } from "@pakka/client/pocket";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import { useWorkspaceChange } from "../../integrations/pakka/useWorkspaceChange.js";
import { conversationResource } from "../../integrations/pakka/resources.js";

export function ForkConversation({
  ui,
  connection,
  target,
  entryId,
  close,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  target: AgentRef;
  entryId: string | null;
  close(): void;
}) {
  const change = useWorkspaceChange(
    ui,
    connection,
    `fork:${target.sessionId}:${target.conversationId}`,
  );
  const [name, setName] = useState("");
  const [profile, setProfile] = useState(target.profile);
  const [presets, setPresets] = useState<readonly string[]>([target.profile]);
  const [error, setError] = useState<string | null>(null);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  useEffect(() => {
    if (!entryId) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, connection),
    ]);
    setName(`分叉 ${target.conversationId}`);
    setProfile(target.profile);
    setError(null);
    void connection.workbench
      .request({ op: "session.list" }, { signal })
      .then((result) => {
        if (
          !signal.aborted &&
          result.kind === "sessions" &&
          result.defaults?.presets
        )
          setPresets(result.defaults.presets);
      })
      .catch((reason) => {
        if (!signal.aborted) setError(describeFailure(reason));
      });
    return () => controller.abort();
  }, [entryId, target, ui, connection]);
  async function complete(result: PocketClientResult | undefined) {
    const ref =
      result?.kind === "reference"
        ? result.ref
        : result?.kind === "conversation.operation" && result.command === "fork"
          ? result.result
          : null;
    if (!ref || !alive()) return;
    close();
    await ui.navigate(conversationResource(ref)).catch((reason) => {
      if (alive()) setError(describeFailure(reason));
    });
  }
  return (
    <>
      {change.pending && (
        <div className="surface flow compact">
          <p>
            {change.pending === "unreadable"
              ? "分叉请求记录不可读，请保留原记录。"
              : `分叉原请求 ${change.pending.requestId} 尚未确认。`}
          </p>
          <Button
            label="核对分叉原请求"
            isDisabled={change.busy || change.pending === "unreadable"}
            onClick={() => {
              void change.run().then(complete);
            }}
          />
        </div>
      )}
      {(change.error ?? error) && !entryId && (
        <p role="alert" className="error-text">
          {change.error ?? error}
        </p>
      )}
      <Dialog
        isOpen={!!entryId}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        aria-label="分叉 Conversation"
        width="min(600px, calc(100vw - 32px))"
      >
        <Layout
          header={
            <LayoutHeader>
              <h1>从此处分叉</h1>
            </LayoutHeader>
          }
          content={
            <LayoutContent label="分叉参数">
              <form
                id={`fork-${ui.instanceId}`}
                className="flow"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!entryId || change.busy || change.pending || !name.trim())
                    return;
                  void change
                    .run({
                      op: "fork",
                      target,
                      entryId,
                      requestId: crypto.randomUUID(),
                      name: name.trim(),
                      profile,
                    })
                    .then(complete);
                }}
              >
                <p className="muted">
                  在原 Session 创建新的 Conversation，历史到所选记录为止。
                </p>
                <p className="identifier">
                  {target.sessionId} / {target.conversationId} · Entry {entryId}
                </p>
                <TextInput
                  label="新 Conversation 名称"
                  value={name}
                  onChange={setName}
                  isDisabled={change.busy || !!change.pending}
                  controlClassName="touch-control"
                />
                <Selector
                  label="Agent preset"
                  value={profile}
                  options={[...presets]}
                  onChange={setProfile}
                  isDisabled={change.busy || !!change.pending}
                  presentation="adaptive"
                  controlClassName="touch-control"
                />
                {(change.error ?? error) && (
                  <p role="alert" className="error-text">
                    {change.error ?? error}
                  </p>
                )}
                {change.pending && (
                  <p>原请求已保留。关闭后可核对，当前不能重复创建。</p>
                )}
              </form>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <div className="actions">
                <Button
                  label="创建分叉"
                  type="submit"
                  form={`fork-${ui.instanceId}`}
                  isDisabled={
                    change.busy ||
                    !!change.pending ||
                    !name.trim() ||
                    name.trim().length > 120
                  }
                />
                <Button label="关闭" variant="ghost" onClick={close} />
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
