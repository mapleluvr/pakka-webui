import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Dialog } from "@astryxdesign/core/Dialog";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import type { UiContext } from "@pakka/webui-sdk";
import type { PocketClientResult } from "@pakka/client/pocket";
import type { PocketNavigation } from "@pakka/protocol/pocket";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import type { useWorkspaceChange } from "../../integrations/pakka/useWorkspaceChange.js";
import { DirectoryField } from "../../ui/DirectoryField.js";
export type Editor =
  | { kind: "session"; name: string; cwd: string }
  | {
      kind: "conversation";
      name: string;
      sessionId: string;
      profile: string;
      cwd: string;
    }
  | { kind: "metadata"; row: PocketNavigation; name: string; archived: boolean }
  | { kind: "folder"; id?: string; name: string }
  | { kind: "folder-delete"; id: string; name: string };

export function WorkspaceEditor({
  ui,
  bindings,
  editor,
  setEditor,
  sessions,
  change,
  error,
  save,
}: {
  ui: UiContext;
  bindings: PakkaConnection;
  editor: Editor | null;
  setEditor(value: Editor | null): void;
  sessions: Extract<PocketClientResult, { kind: "sessions" }> | null;
  change: ReturnType<typeof useWorkspaceChange>;
  error: string | null;
  save(): Promise<void>;
}) {
  const blocked = change.busy || !!change.pending;
  const defaults = sessions?.defaults;
  const editorValid =
    !!editor &&
    (editor.kind === "folder-delete" ||
      (!!editor.name.trim() && editor.name.trim().length <= 120)) &&
    (editor.kind !== "session" || !!editor.cwd.trim()) &&
    (editor.kind !== "conversation" ||
      (!!editor.sessionId && !!editor.profile));

  return (
    <Dialog
      isOpen={!!editor}
      onOpenChange={(open) => {
        if (!open) setEditor(null);
      }}
      aria-label="工作台编辑"
      width="min(600px, calc(100vw - 32px))"
    >
      {editor && (
        <Layout
          header={
            <LayoutHeader>
              <h1>
                {
                  {
                    session: "新建 Session",
                    conversation: "新建 Conversation",
                    metadata: "Conversation 信息",
                    folder: "个人文件夹",
                    "folder-delete": "删除个人文件夹",
                  }[editor.kind]
                }
              </h1>
            </LayoutHeader>
          }
          content={
            <LayoutContent label="工作台表单">
              <form
                id={`workspace-edit-${ui.instanceId}`}
                className="flow"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                {(change.error ?? error) && (
                  <p role="alert" className="error-text">
                    {change.error ?? error}
                  </p>
                )}
                {change.pending && (
                  <p>
                    原请求已保留。关闭编辑窗口后可在工作台核对；当前不能重复保存。
                  </p>
                )}
                {editor.kind === "folder-delete" ? (
                  <p>
                    删除“{editor.name}”后，其中的 Conversations 回到未分类；原
                    Conversation 与历史保留。
                  </p>
                ) : (
                  <TextInput
                    label="名称"
                    value={editor.name}
                    onChange={(name) => setEditor({ ...editor, name })}
                    isDisabled={blocked}
                    autoComplete="off"
                    controlClassName="touch-control"
                  />
                )}
                {editor.kind === "conversation" && (
                  <>
                    <Selector
                      label="目标 Session"
                      value={editor.sessionId}
                      options={(sessions?.sessions ?? [])
                        .filter((row) => row.status === "ready")
                        .map((row) => ({ value: row.id, label: row.name }))}
                      onChange={(sessionId) =>
                        setEditor({ ...editor, sessionId })
                      }
                      isDisabled={blocked}
                      presentation="adaptive"
                      controlClassName="touch-control"
                    />
                    <Selector
                      label="Agent preset"
                      value={editor.profile}
                      options={[
                        ...(defaults?.presets ?? [
                          defaults?.profile ?? "default",
                        ]),
                      ]}
                      onChange={(profile) => setEditor({ ...editor, profile })}
                      isDisabled={blocked}
                      presentation="adaptive"
                      controlClassName="touch-control"
                    />
                    <p className="muted">
                      模型与 Thinking 使用个人缺省或服务默认；创建后可在
                      Conversation 修改。
                    </p>
                  </>
                )}
                {(editor.kind === "session" ||
                  editor.kind === "conversation") && (
                  <DirectoryField
                    ui={ui}
                    connection={bindings}
                    value={editor.cwd}
                    onChange={(cwd) => setEditor({ ...editor, cwd })}
                    disabled={blocked}
                  />
                )}
                {editor.kind === "conversation" && (
                  <p className="muted">目录留空时继承所选 Session。</p>
                )}
                {editor.kind === "metadata" && (
                  <Selector
                    label="归档状态"
                    value={editor.archived ? "archived" : "active"}
                    options={[
                      { value: "active", label: "未归档" },
                      { value: "archived", label: "已归档" },
                    ]}
                    onChange={(value) =>
                      setEditor({ ...editor, archived: value === "archived" })
                    }
                    isDisabled={blocked}
                    presentation="adaptive"
                    controlClassName="touch-control"
                  />
                )}
              </form>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <div className="actions">
                <Button
                  label={change.busy ? "正在提交…" : "保存"}
                  type="submit"
                  form={`workspace-edit-${ui.instanceId}`}
                  isDisabled={blocked || !editorValid}
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
  );
}
