import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { WorkspaceEditor, type Editor } from "./WorkspaceEditor.js";
import { PersonalOrganization } from "./PersonalOrganization.js";
import type { UiViewProps } from "@pakka/webui-sdk";
import type { PocketClientResult } from "@pakka/client/pocket";
import type {
  PocketPersonalNavigation,
  PocketNavigationAction,
} from "@pakka/protocol/pocket";
import { viewHref } from "../../host/links.js";
import { conversationResource } from "../../integrations/pakka/resources.js";
import { workspaceFeedback } from "./workspace-feedback.js";
import {
  useWorkspaceChange,
  type WorkspaceOriginal,
} from "../../integrations/pakka/useWorkspaceChange.js";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

type Listing = Extract<PocketClientResult, { kind: "list" }>;
type Sessions = Extract<PocketClientResult, { kind: "sessions" }>;

export function WorkspaceView({ ui, bindings }: UiViewProps<PakkaConnection>) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [sessions, setSessions] = useState<Sessions | null>(null);
  const [navigation, setNavigation] = useState<PocketPersonalNavigation | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState("*");
  const [folder, setFolder] = useState("*");
  const [archived, setArchived] = useState("active");
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [resolving, setResolving] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [awaitingReopenRead, setAwaitingReopenRead] = useState(false);
  const reopenCheck = useRef<{ id: string } | null>(null);

  const change = useWorkspaceChange(ui, bindings, "workspace");
  const blocked = change.busy || !!change.pending;
  const alive = () => !ui.signal.aborted && !bindings.signal.aborted;
  useEffect(() => {
    const controller = new AbortController();
    const checkingReopen = reopenCheck.current;
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, bindings),
    ]);
    setLoading(true);
    setError(null);
    void Promise.all([
      bindings.workbench.request({ op: "list" }, { signal }),
      bindings.workbench.request({ op: "session.list" }, { signal }),
      bindings.workbench.request({ op: "navigation.read" }, { signal }),
    ])
      .then(([list, sessionList, personal]) => {
        if (signal.aborted) return;
        if (
          list.kind !== "list" ||
          sessionList.kind !== "sessions" ||
          personal.kind !== "navigation"
        )
          throw new Error("工作台数据未得到确认。");
        setListing(list);
        setSessions(sessionList);
        setNavigation(personal.view);
        if (checkingReopen && reopenCheck.current === checkingReopen) {
          reopenCheck.current = null;
          setAwaitingReopenRead(false);
          ui.notice({
            tone: "info",
            key: `reopen:${checkingReopen.id}`,
            message:
              sessionList.sessions.find((row) => row.id === checkingReopen.id)
                ?.status === "ready"
                ? "Session 已重新打开"
                : "已刷新 Session 状态",
          });
        }
      })
      .catch((reason) => {
        if (!signal.aborted) {
          setListing(null);
          setSessions(null);
          setNavigation(null);
          setError(describeFailure(reason));
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [bindings, ui, refresh]);
  useEffect(() => setOffset(0), [selected, folder, archived, search]);
  async function complete(
    confirmation:
      | { result: PocketClientResult; original: WorkspaceOriginal }
      | undefined,
  ) {
    if (!confirmation || !alive()) return;
    const { result, original } = confirmation;
    setEditor(null);
    setRefresh((value) => value + 1);
    ui.notice({
      tone: "success",
      key: original.requestId,
      message: workspaceFeedback(original).confirmed,
    });
    if (result.kind === "managed.session" && result.session)
      setSelected(result.session.id);
    const ref =
      result.kind === "reference"
        ? result.ref
        : result.kind === "conversation.operation" &&
            result.command !== "conversation.set"
          ? result.result
          : null;
    if (ref)
      await ui.navigate(conversationResource(ref)).catch((reason) => {
        if (alive()) setError(describeFailure(reason));
      });
  }
  async function personal(action: PocketNavigationAction) {
    if (!navigation) return;
    await complete(
      await change.run(
        {
          op: "navigation.update",
          input: {
            requestId: crypto.randomUUID(),
            expectedVersion: navigation.version,
            action,
          },
        },
        {
          folderName:
            "folderId" in action
              ? navigation.folders.find((row) => row.id === action.folderId)
                  ?.name
              : undefined,
          conversationName:
            action.kind === "assign"
              ? listing?.navigation?.find(
                  (row) => row.resourceId === action.resourceId,
                )?.name
              : undefined,
        },
      ),
    );
  }
  async function save() {
    if (!editor || blocked) return;
    const requestId = crypto.randomUUID();
    if (editor.kind === "session")
      await complete(
        await change.run({
          op: "session.create",
          requestId,
          name: editor.name.trim(),
          cwd: editor.cwd.trim(),
        }),
      );
    else if (editor.kind === "conversation")
      await complete(
        await change.run({
          op: "create",
          requestId,
          name: editor.name.trim(),
          profile: editor.profile,
          sessionId: editor.sessionId,
          ...(editor.cwd.trim()
            ? { configuration: { cwd: editor.cwd.trim() } }
            : {}),
        }),
      );
    else if (editor.kind === "metadata")
      await complete(
        await change.run({
          op: "conversation.set",
          target: editor.row.ref,
          input: {
            requestId,
            expectedVersion: editor.row.version,
            name: editor.name.trim(),
            archived: editor.archived,
          },
        }),
      );
    else if (editor.kind === "folder-delete")
      await personal({ kind: "folder.delete", folderId: editor.id });
    else
      await personal(
        editor.id
          ? {
              kind: "folder.rename",
              folderId: editor.id,
              name: editor.name.trim(),
            }
          : { kind: "folder.create", name: editor.name.trim() },
      );
  }
  async function reopen(id: string) {
    if (reopening || awaitingReopenRead || loading) return;
    setReopening(id);
    setError(null);
    try {
      const result = await bindings.workbench.request(
        { op: "session.reopen", sessionId: id },
        { signal: requestSignal(ui.signal, bindings) },
      );
      if (result.kind !== "session.state")
        throw new Error("Session 重开结果未确认。");
      if (alive()) {
        ui.notice({
          tone: "info",
          key: `reopen:${id}`,
          message:
            result.session.status === "ready"
              ? "Session 已重新打开"
              : "Session 尚未就绪，请刷新工作台查看状态",
        });
        setSessions((current) =>
          current
            ? {
                ...current,
                sessions: current.sessions.map((row) =>
                  row.id === id ? result.session : row,
                ),
              }
            : current,
        );
        setRefresh((value) => value + 1);
      }
    } catch (reason) {
      if (alive()) {
        reopenCheck.current = { id };
        setAwaitingReopenRead(true);

        setError(describeFailure(reason));
      }
    } finally {
      if (alive()) setReopening(null);
    }
  }
  const rows = (listing?.navigation ?? [])
    .filter(
      (row) =>
        (selected === "*" || row.ref.sessionId === selected) &&
        (archived === "all" || (archived === "archived") === row.archived) &&
        (folder === "*" ||
          (navigation?.assignments[row.resourceId ?? ""] ?? "") === folder) &&
        `${row.name} ${row.ref.sessionId} ${row.ref.conversationId}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      navigation?.mode === "session"
        ? a.ref.sessionId.localeCompare(b.ref.sessionId) ||
          a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const defaults = sessions?.defaults;
  const selectedSession = sessions?.sessions.find((row) => row.id === selected);
  return (
    <section className="flow">
      <header className="feature-heading">
        <div className="flow compact">
          <p className="eyebrow">Workspace</p>
          <h1>Conversations</h1>
        </div>
        <div className="actions">
          <Button
            label={loading ? "正在读取…" : "刷新工作台"}
            variant="ghost"
            isDisabled={loading}
            onClick={() => setRefresh((v) => v + 1)}
          />
          {sessions?.canCreate && defaults && (
            <>
              <Button
                label="新建 Session"
                isDisabled={blocked}
                onClick={() =>
                  setEditor({ kind: "session", name: "", cwd: defaults.cwd })
                }
              />
              <Button
                label="新建 Conversation"
                isDisabled={
                  blocked ||
                  !sessions.sessions.some((row) => row.status === "ready")
                }
                onClick={() =>
                  setEditor({
                    kind: "conversation",
                    name: "",
                    sessionId:
                      selectedSession?.status === "ready"
                        ? selectedSession.id
                        : (sessions.sessions.find(
                            (row) => row.status === "ready",
                          )?.id ?? ""),
                    profile: defaults.profile,
                    cwd: "",
                  })
                }
              />
            </>
          )}
        </div>
      </header>
      {(error ?? change.error) && (
        <p role="alert" className="error-text">
          {error ?? change.error}
        </p>
      )}
      {awaitingReopenRead && (
        <p role="status">
          还不能确认 Session 是否已重新打开。请刷新工作台查看状态。
        </p>
      )}
      {(!change.busy || change.checking) && change.pending && (
        <div className="surface flow compact">
          <p>
            {change.pending === "unreadable"
              ? "本地保存记录不可读。请保留记录，不要重复保存。"
              : `还不能确认是否${workspaceFeedback(change.pending).confirmed}。`}
          </p>
          {change.pending !== "unreadable" && (
            <details>
              <summary>保存详情</summary>
              <p className="identifier">请求号 {change.pending.requestId}</p>
            </details>
          )}
          <Button
            label={
              change.pending === "unreadable"
                ? "无法查看保存状态"
                : workspaceFeedback(change.pending).lookup
            }
            isDisabled={change.busy || change.pending === "unreadable"}
            onClick={() => {
              void change.run().then(complete);
            }}
          />
        </div>
      )}
      {sessions && (
        <div className="surface flow">
          <div className="form-grid">
            <Selector
              label="Session"
              value={selected}
              options={[
                { value: "*", label: "全部获准 Session" },
                ...sessions.sessions.map((row) => ({
                  value: row.id,
                  label: `${row.name} · ${row.status === "ready" ? "已加载" : row.status === "unknown" ? "待核对" : "未加载"}`,
                })),
              ]}
              onChange={setSelected}
              presentation="adaptive"
              controlClassName="touch-control"
            />
            <Selector
              label="归档状态"
              value={archived}
              options={[
                { value: "active", label: "未归档" },
                { value: "archived", label: "已归档" },
                { value: "all", label: "全部" },
              ]}
              onChange={setArchived}
              presentation="adaptive"
              controlClassName="touch-control"
            />
            <TextInput
              label="搜索已加载的对话"
              value={search}
              onChange={setSearch}
              controlClassName="touch-control"
            />
          </div>
          {selectedSession && (
            <div className="flow compact">
              <p className="identifier">{selectedSession.id}</p>
              {selectedSession.cwd && (
                <p className="identifier">{selectedSession.cwd}</p>
              )}
              {selectedSession.problem?.canReopen && sessions.canCreate && (
                <Button
                  label="重新打开原 Session"
                  isDisabled={!!reopening || awaitingReopenRead || loading}
                  onClick={() => {
                    void reopen(selectedSession.id);
                  }}
                />
              )}
              {selectedSession.problem &&
                !selectedSession.problem.canReopen && (
                  <p>来源当前不可得：{selectedSession.problem.kind}</p>
                )}
            </div>
          )}
        </div>
      )}
      {navigation && (
        <PersonalOrganization
          navigation={navigation}
          blocked={blocked}
          folder={folder}
          setFolder={setFolder}
          personal={personal}
          setEditor={setEditor}
        />
      )}
      {listing && (
        <div className="surface flow">
          <p className="muted">
            {rows.length} 个匹配的已加载
            Conversation。未加载来源可用已知引用读取保存历史。
          </p>
          <ul className="resource-list">
            {rows.slice(offset, offset + 50).map((row) => (
              <li
                key={JSON.stringify([
                  row.ref.sessionId,
                  row.ref.conversationId,
                ])}
                className="flow compact"
              >
                <a
                  className="resource-link"
                  href={viewHref({
                    plugin: "conversations",
                    view: "history",
                    resource: conversationResource(row.ref),
                  })}
                >
                  <strong>
                    {row.name}
                    {row.archived ? " · 已归档" : ""}
                  </strong>
                  <span className="muted identifier">
                    Session {row.ref.sessionId}
                  </span>
                  <span className="muted identifier">
                    Conversation {row.ref.conversationId}
                  </span>
                </a>
                <div className="actions">
                  {bindings.person.role === "admin" && (
                    <Button
                      label={`管理 ${row.name}`}
                      variant="ghost"
                      isDisabled={blocked}
                      onClick={() =>
                        setEditor({
                          kind: "metadata",
                          row,
                          name: row.name,
                          archived: row.archived,
                        })
                      }
                    />
                  )}
                  {navigation && row.resourceId && (
                    <Selector
                      label={`文件夹 · ${row.name}`}
                      value={navigation.assignments[row.resourceId] ?? ""}
                      options={[
                        { value: "", label: "未分类" },
                        ...navigation.folders.map((item) => ({
                          value: item.id,
                          label: item.name,
                        })),
                      ]}
                      onChange={(folderId) => {
                        void personal({
                          kind: "assign",
                          resourceId: row.resourceId!,
                          folderId: folderId || null,
                        });
                      }}
                      isDisabled={blocked}
                      presentation="adaptive"
                      controlClassName="touch-control"
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
          {(rows.length > 50 || offset > 0) && (
            <div className="actions">
              <Button
                label="上一页"
                variant="ghost"
                isDisabled={offset === 0}
                onClick={() => setOffset((v) => Math.max(0, v - 50))}
              />
              <Button
                label="下一页"
                variant="ghost"
                isDisabled={offset + 50 >= rows.length}
                onClick={() => setOffset((v) => v + 50)}
              />
            </div>
          )}
        </div>
      )}
      <details className="surface">
        <summary>高级定位</summary>
        <form
          className="flow"
          onSubmit={(event) => {
            event.preventDefault();
            if (resolving || !sessionId.trim() || !conversationId.trim())
              return;
            setResolving(true);
            setError(null);
            void ui
              .navigate(
                conversationResource({
                  sessionId: sessionId.trim(),
                  conversationId: conversationId.trim(),
                }),
              )
              .then((result) => {
                if (
                  alive() &&
                  result.status !== "ready" &&
                  result.status !== "unloaded"
                )
                  setError(result.message ?? `原资源不可读：${result.status}`);
              })
              .catch((reason) => {
                if (alive()) setError(describeFailure(reason));
              })
              .finally(() => {
                if (alive()) setResolving(false);
              });
          }}
        >
          <h2>打开已知原历史</h2>
          <div className="form-grid">
            <TextInput
              label="Session ID"
              value={sessionId}
              onChange={setSessionId}
              controlClassName="touch-control"
              autoComplete="off"
            />
            <TextInput
              label="Conversation ID"
              value={conversationId}
              onChange={setConversationId}
              controlClassName="touch-control"
              autoComplete="off"
            />
          </div>
          <div>
            <Button
              label={resolving ? "正在核对…" : "读取原历史"}
              type="submit"
              isDisabled={
                resolving || !sessionId.trim() || !conversationId.trim()
              }
            />
          </div>
        </form>
      </details>
      <WorkspaceEditor
        ui={ui}
        bindings={bindings}
        editor={editor}
        setEditor={setEditor}
        sessions={sessions}
        change={change}
        error={error}
        save={save}
      />
    </section>
  );
}
