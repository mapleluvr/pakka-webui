import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import type { UiContext } from "@pakka/webui-sdk";
import type { AgentRef } from "@pakka/protocol/pocket";
import type {
  CollaborationAction,
  CollaborationReceipt,
} from "@pakka/protocol/webui";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import {
  collaborationScope,
  hasCollaborationPending,
  useCollaboration,
} from "./useCollaboration.js";
import { usePeopleSettings } from "../identity/usePeopleSettings.js";
import "./collaboration.css";

interface NoteDraft {
  baseVersion: number;
  baseText: string | null;
  text: string;
}
interface Drafts {
  text: string;
  quoteId: string | null;
  mentions: string[];
  note: NoteDraft | null;
}
const emptyDrafts = (): Drafts => ({
  text: "",
  quoteId: null,
  mentions: [],
  note: null,
});
const labels = {
  post: "聊天",
  note: "笔记",
  react: "回应",
  pin: "置顶",
  driver: "控制权",
};
const reactions = [
  { emoji: "👍", label: "赞同" },
  { emoji: "👎", label: "不赞同" },
  { emoji: "❤️", label: "喜欢" },
  { emoji: "🎉", label: "庆祝" },
  { emoji: "👀", label: "关注" },
  { emoji: "✅", label: "确认" },
];
function ReactionIcon({ emoji }: { emoji: string }) {
  const drawings =
    emoji === "👍" || emoji === "👎" ? (
      <g transform={emoji === "👎" ? "rotate(180 12 12)" : undefined}>
        <path d="M7 10v11H3V10zm0 10h10a2 2 0 0 0 2-1.6l1.4-6.7A2 2 0 0 0 18.4 9H14l1-4.1A2.5 2.5 0 0 0 12.5 2L7 10" />
      </g>
    ) : emoji === "❤️" ? (
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
    ) : emoji === "🎉" ? (
      <>
        <path d="m3 21 4-13 10 10-14 3Z M11 3l1 3 M17 2l-1 5 M22 7l-4 2 M21 13l-3-1" />
        <path d="m6 12 6 6" />
      </>
    ) : emoji === "👀" ? (
      <>
        <ellipse cx="7" cy="12" rx="4" ry="7" />
        <ellipse cx="17" cy="12" rx="4" ry="7" />
        <path d="M8 10v4 M18 10v4" />
      </>
    ) : (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="m7 12 3 3 7-7" />
      </>
    );
  return (
    <svg
      className="collaboration-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawings}
    </svg>
  );
}
function receiptText(receipt: CollaborationReceipt): string {
  const result = receipt.result;
  return result.kind === "note"
    ? `原笔记保存已确认 · 版本 ${result.version}`
    : result.kind === "driver"
      ? `原控制权操作已确认 · 版本 ${result.driver.version}`
      : `原${labels[result.kind]}操作已确认`;
}
export function Collaboration({
  ui,
  connection,
  target,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  target: AgentRef;
}) {
  const personal = usePeopleSettings(connection).mode === "personal";
  const [open, setOpen] = useState(() =>
    hasCollaborationPending(connection, target),
  );
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts);
  const entry = useRef<HTMLButtonElement>(null);
  const pending = hasCollaborationPending(connection, target);
  function close() {
    setOpen(false);
    setDrafts((previous) => ({
      ...previous,
      note:
        previous.note && previous.note.text !== previous.note.baseText
          ? previous.note
          : null,
    }));
    entry.current?.focus();
  }
  return (
    <div className="flow compact human-collaboration">
      <div className="actions">
        <Button
          ref={entry}
          label={personal ? "笔记与置顶" : "人类协作"}
          variant="ghost"
          aria-expanded={open}
          onClick={() => {
            if (open) close();
            else setOpen(true);
          }}
        />
        {!open && pending && <span role="status">有待核对的协作原请求</span>}
      </div>
      {open && (
        <CollaborationPanel
          personal={personal}
          ui={ui}
          connection={connection}
          target={target}
          drafts={drafts}
          setDrafts={setDrafts}
          close={close}
        />
      )}
    </div>
  );
}
function CollaborationPanel({
  personal,
  ui,
  connection,
  target,
  drafts,
  setDrafts,
  close,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  target: AgentRef;
  drafts: Drafts;
  personal: boolean;
  setDrafts: Dispatch<SetStateAction<Drafts>>;
  close(): void;
}) {
  const shared = useCollaboration(ui, connection, target, !personal);
  const [showChat, setShowChat] = useState(false);
  const [search, setSearch] = useState("");
  const [pinned, setPinned] = useState(false);
  const [page, setPage] = useState(0);
  const [ttl, setTtl] = useState("60000");
  const [inputError, setInputError] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const note = shared.view?.snapshot.note;
  const messages = shared.view?.snapshot.messages ?? [];
  const driver = shared.view?.snapshot.driver;
  const postScope = collaborationScope({ kind: "post", text: "" });
  const noteScope = collaborationScope({
    kind: "note",
    expectedVersion: 0,
    text: "",
  });
  const driverScope = collaborationScope({
    kind: "driver",
    action: "claim",
    expectedVersion: 0,
  });
  const postPending = shared.pending.get(postScope);
  const notePending = shared.pending.get(noteScope);
  const names = new Map([[connection.person.id, connection.person.name]]);
  for (const person of shared.view?.snapshot.presence ?? [])
    names.set(person.personId, person.name);
  for (const message of messages)
    names.set(message.authorId, message.authorName);
  const nameOf = (id: string | null) =>
    id === null ? "无人" : (names.get(id) ?? "其他成员");
  const locked = (action: CollaborationAction) =>
    !shared.view ||
    !!shared.storageError ||
    shared.pending.has(collaborationScope(action)) ||
    shared.busyScopes.has(collaborationScope(action));
  useEffect(() => {
    panel.current?.focus();
  }, []);
  useEffect(() => {
    setDrafts((previous) => {
      let next = previous;
      if (
        postPending &&
        postPending !== "unreadable" &&
        postPending.action.kind === "post" &&
        !previous.text
      ) {
        const action = postPending.action;
        next = {
          ...next,
          text: action.text,
          quoteId: action.quoteId ?? null,
          mentions: [...(action.mentions ?? [])],
        };
      }
      if (
        notePending &&
        notePending !== "unreadable" &&
        notePending.action.kind === "note" &&
        !previous.note
      ) {
        const action = notePending.action;
        next = {
          ...next,
          note: {
            baseVersion: action.expectedVersion,
            baseText: null,
            text: action.text,
          },
        };
      } else if (
        note &&
        !notePending &&
        (!previous.note || previous.note.text === previous.note.baseText) &&
        previous.note?.baseVersion !== note.version
      ) {
        next = {
          ...next,
          note: {
            baseVersion: note.version,
            baseText: note.text,
            text: note.text,
          },
        };
      }
      return next;
    });
  }, [note, postPending, notePending, setDrafts]);
  function confirmed(receipt: CollaborationReceipt | null) {
    if (
      !receipt ||
      ui.signal.aborted ||
      connection.signal.aborted ||
      shared.signal.aborted
    )
      return;
    const action = receipt.original.action;
    setDrafts((previous) => {
      if (
        action.kind === "post" &&
        previous.text.trim() === action.text &&
        previous.quoteId === (action.quoteId ?? null) &&
        JSON.stringify([...previous.mentions].sort()) ===
          JSON.stringify([...(action.mentions ?? [])].sort())
      )
        return { ...previous, text: "", quoteId: null, mentions: [] };
      if (
        action.kind === "note" &&
        previous.note?.text === action.text &&
        previous.note.baseVersion === action.expectedVersion
      )
        return { ...previous, note: null };
      return previous;
    });
  }
  async function send() {
    setInputError(null);
    const text = drafts.text.trim();
    if (!text || text.length > 8192) {
      setInputError("聊天内容需为 1–8192 个字符。");
      chatInput.current?.focus();
      return;
    }
    confirmed(
      await shared.act({
        kind: "post",
        text,
        ...(drafts.quoteId ? { quoteId: drafts.quoteId } : {}),
        ...(drafts.mentions.length ? { mentions: drafts.mentions } : {}),
      }),
    );
  }
  const filtered = messages.filter(
    (message) =>
      (!personal || showChat || message.pinned) &&
      (!pinned || message.pinned) &&
      (!search ||
        message.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
        message.authorName
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const end = filtered.length - currentPage * 20;
  const rows = filtered.slice(Math.max(0, end - 20), end);
  const quote = messages.find((message) => message.id === drafts.quoteId);
  const driverExpired = !!driver?.expiresAt && driver.expiresAt <= Date.now();
  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="surface flow collaboration-panel"
      aria-label={personal ? "笔记与置顶" : "人类协作"}
    >
      <header className="feature-heading">
        <div className="flow compact">
          <h2>{personal ? "笔记与置顶" : "人类协作"}</h2>
          <p className="muted">
            {personal
              ? "笔记和置顶内容随对话保存，可在其他设备接着查看。"
              : "聊天与笔记供人类共享；模型输入使用下方 Conversation 输入框。"}
          </p>
        </div>
        <Button label="关闭协作" variant="ghost" onClick={close} />
      </header>
      <div className="collaboration-status">
        <span role="status">{shared.observation}</span>
        <Button
          label={shared.paused ? "继续协作观察" : "暂停协作观察"}
          variant="ghost"
          onClick={shared.paused ? shared.resume : shared.pause}
        />
      </div>
      {shared.readError && (
        <p role="alert" className="error-text">
          {shared.readError}
        </p>
      )}
      {shared.storageError && (
        <p role="alert" className="error-text">
          {shared.storageError}
        </p>
      )}
      {shared.pending.size > 0 && (
        <section
          className="flow compact collaboration-pending"
          aria-label="协作原请求"
        >
          <h3>待核对的原请求</h3>
          {[...shared.pending].map(([scope, request]) => (
            <div key={scope} className="flow compact">
              <div className="actions">
                <span>
                  {request === "unreadable"
                    ? "协作原请求不可读"
                    : `${labels[request.action.kind]}结果尚未确认`}
                </span>
                <Button
                  label={
                    request === "unreadable"
                      ? "无法核对原请求"
                      : `核对${labels[request.action.kind]}原请求`
                  }
                  variant="ghost"
                  isDisabled={
                    request === "unreadable" || shared.busyScopes.has(scope)
                  }
                  onClick={async () => {
                    confirmed(await shared.reconcile(scope));
                  }}
                />
              </div>
              {request !== "unreadable" && (
                <details>
                  <summary>原请求信息</summary>
                  <p className="identifier">{request.requestId}</p>
                  {request.action.kind === "post" ||
                  request.action.kind === "note" ? (
                    <p className="collaboration-text">{request.action.text}</p>
                  ) : null}
                </details>
              )}
            </div>
          ))}
        </section>
      )}
      {[...shared.errors].map(([scope, error]) => (
        <p key={scope} role="alert" className="error-text">
          {error}
        </p>
      ))}
      {[...shared.receipts].map(([scope, receipt]) => (
        <p key={scope} role="status" className="muted">
          {receiptText(receipt)}
        </p>
      ))}
      {shared.view && !personal && (
        <section
          className="collaboration-driver flow compact"
          aria-label="当前控制权"
        >
          <h3>当前控制权</h3>
          <p>
            {driver?.personId === null
              ? "未指定控制者"
              : `${nameOf(driver?.personId ?? null)}${driverExpired ? " · 已到期" : ""}`}
            {driver?.expiresAt
              ? ` · 截止 ${new Date(driver.expiresAt).toLocaleTimeString()}`
              : ""}
          </p>
          <p className="muted">
            当前控制权与原操作回执分别显示；输入准入由服务按实际期限核对。
          </p>
          {(shared.view.canControl || shared.view.canTake) && driver && (
            <div className="actions">
              <Selector
                label="控制时长"
                value={ttl}
                options={[
                  { value: "60000", label: "1 分钟" },
                  { value: "300000", label: "5 分钟" },
                ]}
                onChange={setTtl}
                presentation="adaptive"
                controlClassName="touch-control"
              />
              {shared.view.canControl && (
                <Button
                  label={
                    driver.personId === connection.person.id
                      ? "续期控制权"
                      : "领取控制权"
                  }
                  isDisabled={
                    locked({
                      kind: "driver",
                      action: "claim",
                      expectedVersion: driver.version,
                    }) ||
                    (!!driver.personId &&
                      driver.personId !== connection.person.id &&
                      !driverExpired)
                  }
                  onClick={() => {
                    void shared.act({
                      kind: "driver",
                      action: "claim",
                      expectedVersion: driver.version,
                      ttlMs: Number(ttl),
                    });
                  }}
                />
              )}
              {shared.view.canTake &&
                driver.personId !== connection.person.id &&
                driver.personId !== null && (
                  <Button
                    label="接管控制权"
                    variant="ghost"
                    isDisabled={
                      shared.pending.has(driverScope) ||
                      shared.busyScopes.has(driverScope)
                    }
                    onClick={() => {
                      void shared.act({
                        kind: "driver",
                        action: "take",
                        expectedVersion: driver.version,
                        ttlMs: Number(ttl),
                      });
                    }}
                  />
                )}
              {driver.personId !== null &&
                (driver.personId === connection.person.id ||
                  shared.view.canTake) && (
                  <Button
                    label="释放控制权"
                    variant="ghost"
                    isDisabled={
                      shared.pending.has(driverScope) ||
                      shared.busyScopes.has(driverScope)
                    }
                    onClick={() => {
                      void shared.act({
                        kind: "driver",
                        action: "release",
                        expectedVersion: driver.version,
                      });
                    }}
                  />
                )}
            </div>
          )}
          <div className="collaboration-presence" aria-label="短期在场状态">
            {shared.view.snapshot.presence.length ? (
              shared.view.snapshot.presence.map((person) => (
                <span key={person.personId}>
                  {person.name}
                  {person.state === "typing" ? " · 正在输入" : " · 在场"}
                </span>
              ))
            ) : (
              <span className="muted">暂无其他在场状态</span>
            )}
          </div>
        </section>
      )}
      {personal && (
        <CheckboxInput
          label="显示人类聊天"
          value={showChat}
          onChange={setShowChat}
        />
      )}
      <div className="collaboration-columns">
        <section
          className="flow"
          aria-label={personal && !showChat ? "置顶内容" : "人类聊天"}
        >
          <h3>{personal && !showChat ? "置顶内容" : "人类聊天"}</h3>
          <div className="actions collaboration-filters">
            <TextInput
              label="搜索聊天"
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(0);
              }}
              controlClassName="touch-control"
            />
            <CheckboxInput
              className="collaboration-checkbox"
              label="仅看置顶"
              value={pinned}
              onChange={(value) => {
                setPinned(value);
                setPage(0);
              }}
            />
          </div>
          {shared.view && !filtered.length && (
            <p className="muted">
              {search || pinned ? "没有匹配的聊天。" : "暂无聊天消息。"}
            </p>
          )}
          <div className="flow compact collaboration-messages">
            {rows.map((message) => {
              const parent = messages.find(
                (item) => item.id === message.quoteId,
              );
              return (
                <article
                  key={message.id}
                  className="flow compact collaboration-message"
                >
                  <header className="actions">
                    <strong>{message.authorName}</strong>
                    <time
                      className="muted"
                      dateTime={new Date(message.createdAt).toISOString()}
                    >
                      {new Date(message.createdAt).toLocaleString()}
                    </time>
                    {message.pinned && <span>已置顶</span>}
                  </header>
                  {parent && (
                    <blockquote className="collaboration-quote">
                      <strong>{parent.authorName}</strong>
                      <p>{parent.text}</p>
                    </blockquote>
                  )}
                  <p className="collaboration-text">{message.text}</p>
                  {message.mentions.length > 0 && (
                    <p className="muted">
                      提及：{message.mentions.map(nameOf).join("、")}
                    </p>
                  )}
                  {(!personal || showChat) && (
                    <div className="collaboration-reactions">
                      {reactions.map((reaction) => {
                        const record = message.reactions.find(
                            (item) => item.emoji === reaction.emoji,
                          ),
                          active =
                            record?.people.includes(connection.person.id) ??
                            false;
                        const action: CollaborationAction = {
                          kind: "react",
                          messageId: message.id,
                          emoji: reaction.emoji,
                          active: !active,
                        };
                        return (
                          <Button
                            key={reaction.emoji}
                            label={`${reaction.label} · ${record?.people.length ?? 0}`}
                            variant="ghost"
                            isIconOnly
                            aria-pressed={active}
                            isDisabled={locked(action)}
                            icon={
                              <span className="collaboration-reaction-icon">
                                <ReactionIcon emoji={reaction.emoji} />
                                <span className="collaboration-count">
                                  {record?.people.length ?? 0}
                                </span>
                              </span>
                            }
                            onClick={() => {
                              void shared.act(action);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                  <div className="actions">
                    {(!personal || showChat) && (
                      <Button
                        label="引用消息"
                        variant="ghost"
                        isDisabled={!shared.view || !!postPending}
                        onClick={() => {
                          setDrafts((previous) => ({
                            ...previous,
                            quoteId: message.id,
                          }));
                          chatInput.current?.focus();
                        }}
                      />
                    )}
                    {shared.view?.canPin && (
                      <Button
                        label={message.pinned ? "取消置顶" : "置顶消息"}
                        variant="ghost"
                        isDisabled={locked({
                          kind: "pin",
                          messageId: message.id,
                          pinned: !message.pinned,
                        })}
                        onClick={() => {
                          void shared.act({
                            kind: "pin",
                            messageId: message.id,
                            pinned: !message.pinned,
                          });
                        }}
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {shared.view && (
            <div className="actions">
              <span className="muted">
                当前授权窗口 {messages.length} 条 · 第 {currentPage + 1}/
                {pageCount} 页
              </span>
              <Button
                label="较早聊天"
                variant="ghost"
                isDisabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              />
              <Button
                label="较新聊天"
                variant="ghost"
                isDisabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              />
            </div>
          )}
          {(!personal || showChat) && (
            <form
              className="flow compact"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {drafts.quoteId && (
                <div className="flow compact collaboration-quote">
                  <p>
                    引用
                    {quote
                      ? ` ${quote.authorName}：${quote.text}`
                      : "的原消息暂不在当前窗口"}
                  </p>
                  <Button
                    label="取消引用"
                    variant="ghost"
                    onClick={() =>
                      setDrafts((previous) => ({ ...previous, quoteId: null }))
                    }
                  />
                </div>
              )}
              <TextArea
                ref={chatInput}
                label="发给人类的消息"
                value={drafts.text}
                rows={3}
                autoComplete="off"
                controlClassName="composer-input"
                onChange={(text) => {
                  setDrafts((previous) => ({ ...previous, text }));
                  shared.typing();
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey) &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="actions">
                <Selector
                  label="提及成员"
                  options={[...names]
                    .filter(([id]) => id !== connection.person.id)
                    .map(([value, label]) => ({ value, label }))}
                  value=""
                  placeholder="选择成员…"
                  isDisabled={!shared.view || drafts.mentions.length >= 16}
                  presentation="adaptive"
                  controlClassName="touch-control"
                  onChange={(personId) => {
                    if (!drafts.mentions.includes(personId))
                      setDrafts((previous) => ({
                        ...previous,
                        mentions: [...previous.mentions, personId],
                      }));
                  }}
                />
                {drafts.mentions.map((personId) => (
                  <Button
                    key={personId}
                    label={`取消提及 ${nameOf(personId)}`}
                    variant="ghost"
                    onClick={() =>
                      setDrafts((previous) => ({
                        ...previous,
                        mentions: previous.mentions.filter(
                          (id) => id !== personId,
                        ),
                      }))
                    }
                  />
                ))}
              </div>
              <div className="actions">
                <Button
                  label="发送聊天"
                  type="submit"
                  isLoading={shared.busyScopes.has(postScope)}
                  isDisabled={
                    !shared.view || !!shared.storageError || !!postPending
                  }
                />
                <span className="muted">Ctrl/⌘+Enter 发送</span>
              </div>
              {inputError && (
                <p role="alert" className="error-text">
                  {inputError}
                </p>
              )}
            </form>
          )}
        </section>
        <section className="flow" aria-label="共享笔记">
          <h3>共享笔记{note ? ` · 当前版本 ${note.version}` : ""}</h3>
          {shared.view?.canEditNote ? (
            <form
              className="flow compact"
              onSubmit={(event) => {
                event.preventDefault();
                if (drafts.note)
                  void shared
                    .act({
                      kind: "note",
                      expectedVersion: drafts.note.baseVersion,
                      text: drafts.note.text,
                    })
                    .then(confirmed);
              }}
            >
              {drafts.note &&
                note &&
                drafts.note.baseVersion !== note.version && (
                  <div role="status" className="flow compact">
                    <p>
                      {"共享笔记已更新，当前草稿仍保留原版本 "}
                      {drafts.note.baseVersion}。
                    </p>
                    <Button
                      label="按当前版本继续编辑"
                      variant="ghost"
                      isDisabled={!!notePending}
                      onClick={() =>
                        setDrafts((previous) => ({
                          ...previous,
                          note: previous.note
                            ? {
                                ...previous.note,
                                baseVersion: note.version,
                                baseText: note.text,
                              }
                            : null,
                        }))
                      }
                    />
                    <Button
                      label="读取当前笔记内容"
                      variant="ghost"
                      isDisabled={!!notePending}
                      onClick={() =>
                        setDrafts((previous) => ({
                          ...previous,
                          note: {
                            baseVersion: note.version,
                            baseText: note.text,
                            text: note.text,
                          },
                        }))
                      }
                    />
                  </div>
                )}
              <TextArea
                label="编辑共享笔记"
                value={drafts.note?.text ?? ""}
                rows={7}
                autoComplete="off"
                controlClassName="composer-input"
                onChange={(text) =>
                  setDrafts((previous) => ({
                    ...previous,
                    note: previous.note
                      ? { ...previous.note, text }
                      : {
                          baseVersion: note?.version ?? 0,
                          baseText: note?.text ?? "",
                          text,
                        },
                  }))
                }
              />
              <Button
                label="保存共享笔记"
                type="submit"
                isLoading={shared.busyScopes.has(noteScope)}
                isDisabled={
                  !shared.view ||
                  !!shared.storageError ||
                  !!notePending ||
                  !drafts.note ||
                  drafts.note.text === drafts.note.baseText
                }
              />
            </form>
          ) : note ? (
            <p className="collaboration-text">
              {note.text || "暂无共享笔记。"}
            </p>
          ) : (
            <p className="muted">读取协作后显示当前笔记。</p>
          )}
        </section>
      </div>
    </section>
  );
}
