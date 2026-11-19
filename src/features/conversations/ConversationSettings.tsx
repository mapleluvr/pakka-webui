import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SettingsIcon } from "./ComposerIcons.js";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import type { UiContext } from "@pakka/webui-sdk";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import type { useConversationConfiguration } from "./useConversationConfiguration.js";
import { DirectoryField } from "../../ui/DirectoryField.js";

type Configuration = ReturnType<typeof useConversationConfiguration>;
export function ConversationSettings({
  ui,
  connection,
  config,
  disabled,
  running,
  compact = false,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  config: Configuration;
  disabled: boolean;
  running: boolean;
  compact?: boolean;
}) {
  const [editor, setEditor] = useState<{
    kind: "cwd" | "profile";
    cwd: string;
    profile: string;
  } | null>(null);
  const current = config.configuration;
  const blocked =
    disabled ||
    running ||
    config.busy ||
    config.unconfirmed ||
    !current?.canConfigure ||
    !config.supportsRequests;
  const open = () => {
    const pending =
      config.pending && config.pending !== "unreadable"
        ? config.pending.selection
        : undefined;
    setEditor({
      kind: pending?.kind === "profile" ? "profile" : "cwd",
      cwd:
        pending?.kind === "agent" && pending.change.cwd
          ? pending.change.cwd
          : (current?.current?.cwd ?? ""),
      profile:
        pending?.kind === "profile"
          ? pending.profile
          : (current?.ref.profile ?? "default"),
    });
  };
  async function save() {
    if (!editor || blocked) return;
    const saved =
      editor.kind === "cwd"
        ? await config.configure({ cwd: editor.cwd.trim() })
        : await config.preset(editor.profile);
    if (saved && !ui.signal.aborted && !connection.signal.aborted)
      setEditor(null);
  }
  return (
    <>
      {compact ? (
        <IconButton
          label="目录与 Agent preset"
          icon={<SettingsIcon />}
          variant="ghost"
          isDisabled={!current}
          onClick={open}
        />
      ) : (
        <Button
          label="目录与 Agent preset"
          variant="ghost"
          isDisabled={!current}
          onClick={open}
        />
      )}
      <Dialog
        isOpen={!!editor}
        onOpenChange={(value) => {
          if (!value) setEditor(null);
        }}
        aria-label="Conversation 设置"
        width="min(640px, calc(100vw - 32px))"
      >
        {editor && (
          <Layout
            header={
              <LayoutHeader>
                <h1>Conversation 设置</h1>
              </LayoutHeader>
            }
            content={
              <LayoutContent label="Conversation 配置表单">
                <form
                  id={`conversation-config-${ui.instanceId}`}
                  className="flow"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                >
                  <p className="muted identifier">
                    当前 preset：{current?.ref.profile} ·{" "}
                    {current?.current?.model}
                  </p>
                  <Selector
                    label="修改项目"
                    value={editor.kind}
                    options={[
                      { value: "cwd", label: "工作目录" },
                      { value: "profile", label: "Agent preset" },
                    ]}
                    onChange={(kind) =>
                      setEditor({ ...editor, kind: kind as "cwd" | "profile" })
                    }
                    isDisabled={blocked}
                    presentation="adaptive"
                    controlClassName="touch-control"
                  />
                  {editor.kind === "cwd" ? (
                    <>
                      <DirectoryField
                        ui={ui}
                        connection={connection}
                        target={config.currentTarget()}
                        value={editor.cwd}
                        onChange={(cwd) => setEditor({ ...editor, cwd })}
                        disabled={blocked}
                      />
                      <p className="muted">
                        目录用于此 Conversation 后续工具执行；模型、Thinking 与
                        preset 保留各自设置。
                      </p>
                    </>
                  ) : (
                    <>
                      <Selector
                        label="Agent preset"
                        value={editor.profile}
                        options={config.presets.map((row) => ({
                          value: row.id,
                          label: row.id,
                        }))}
                        onChange={(profile) =>
                          setEditor({ ...editor, profile })
                        }
                        isDisabled={blocked}
                        presentation="adaptive"
                        controlClassName="touch-control"
                      />
                      {config.presets
                        .filter((row) => row.id === editor.profile)
                        .map((row) => (
                          <div key={row.id} className="surface flow compact">
                            <p className="identifier">模型：{row.model}</p>
                            <p className="identifier">目录：{row.cwd}</p>
                          </div>
                        ))}
                      <p>
                        应用 preset 会替换此 Conversation
                        的模型、Thinking、工具、指令与工作目录。已有历史保留。
                      </p>
                    </>
                  )}
                  {running && (
                    <p role="status">
                      请等待当前工作与排队输入结束后修改配置。
                    </p>
                  )}
                  {!config.supportsRequests && (
                    <p>当前来源尚不支持配置回执，配置入口暂不可用。</p>
                  )}
                  {config.pending && (
                    <p role="status">
                      原配置请求已保留。关闭此窗口后可核对原请求，当前不能重复保存。
                    </p>
                  )}
                  {config.error && (
                    <p role="alert" className="error-text">
                      {config.error}
                    </p>
                  )}
                </form>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <div className="actions">
                  <Button
                    label={config.busy ? "正在保存…" : "保存配置"}
                    type="submit"
                    form={`conversation-config-${ui.instanceId}`}
                    isDisabled={
                      blocked ||
                      (editor.kind === "cwd"
                        ? !editor.cwd.trim()
                        : !config.presets.some(
                            (row) => row.id === editor.profile,
                          ))
                    }
                  />
                  <Button
                    label="关闭"
                    variant="ghost"
                    onClick={() => setEditor(null)}
                  />
                </div>
              </LayoutFooter>
            }
          />
        )}
      </Dialog>
    </>
  );
}
