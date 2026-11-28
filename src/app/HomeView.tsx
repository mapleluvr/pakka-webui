import { useEffect, useState, type MouseEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { PocketClientResult } from "@pakka/client/pocket";
import type { RegistrySnapshot } from "../host/registry.js";
import type { PakkaConnection } from "../integrations/pakka/connection.js";
import { conversationResource } from "../integrations/pakka/resources.js";
import { viewHref } from "../host/links.js";
import { BrandMark } from "../ui/BrandMark.js";
import "./home.css";

type Listing = Extract<PocketClientResult, { kind: "list" }>;
type LinkClick = (event: MouseEvent<HTMLAnchorElement>) => void;

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomeConversations({
  connection,
  linkClick,
}: {
  connection: PakkaConnection;
  linkClick: LinkClick;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, connection.signal]);
    setListing(null);
    setFailed(false);
    void connection.workbench
      .request({ op: "list" }, { signal })
      .then((result) => {
        if (signal.aborted) return;
        if (result.kind !== "list")
          throw new Error("Conversation list unavailable");
        setListing(result);
      })
      .catch(() => {
        if (!signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [connection, refresh]);
  const rows = (listing?.navigation ?? [])
    .filter((row) => !row.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 3);
  return (
    <section
      className="home-conversations"
      aria-labelledby="home-conversations-title"
    >
      <div className="home-section-heading">
        <h2 id="home-conversations-title">继续工作</h2>
        <a
          href={viewHref({ plugin: "conversations", view: "workspace" })}
          onClick={linkClick}
        >
          全部对话 <ArrowIcon />
        </a>
      </div>
      {failed && (
        <div className="home-empty" role="status">
          <p>暂时无法读取对话列表。</p>
          <Button
            label="重新读取"
            variant="ghost"
            onClick={() => setRefresh((value) => value + 1)}
          />
        </div>
      )}
      {!failed && !listing && (
        <p className="home-empty" role="status">
          正在读取对话…
        </p>
      )}
      {listing && rows.length === 0 && (
        <p className="home-empty">前往工作台，打开或创建一个对话。</p>
      )}
      {listing && rows.length > 0 && (
        <ul className="home-conversation-list">
          {rows.map((row) => (
            <li key={JSON.stringify(row.ref)}>
              <a
                href={viewHref({
                  plugin: "conversations",
                  view: "history",
                  resource: conversationResource(row.ref),
                })}
                onClick={linkClick}
              >
                <span className="home-conversation-icon" aria-hidden="true">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-8L5 21v-3.5H4A1.5 1.5 0 0 1 2.5 16V6A1.5 1.5 0 0 1 4 4.5Z"
                      strokeLinejoin="round"
                    />
                    <path d="M7 9h10M7 13h6" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="home-conversation-name">{row.name}</span>
                <ArrowIcon />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HomeView({
  connection,
  busy,
  unavailable,
  navigation,
  linkClick,
  openLogin,
}: {
  connection: PakkaConnection | null;
  busy: boolean;
  unavailable: string | null;
  navigation: RegistrySnapshot["navigation"];
  linkClick: LinkClick;
  openLogin(): void;
}) {
  const loginLabel = busy ? "正在连接…" : "登录 Pakka";
  const shortcuts = [
    {
      plugin: "model-settings",
      view: "connections",
      title: "提供商与模型",
      description: "选择你的模型与连接",
    },
    {
      plugin: "people-settings",
      view: "people",
      title: "设备与访问",
      description: "在其他设备上接续工作",
    },
  ].filter(
    (target) =>
      connection &&
      navigation.some(
        (item) => item.plugin === target.plugin && item.view === target.view,
      ),
  );
  return (
    <section className="home">
      <header className="home-hero">
        <BrandMark />
        <h1>
          Where all
          <br />
          <em>miracles begin.</em>
        </h1>
        {unavailable && (
          <p className="home-unavailable" role="status">
            {unavailable}
          </p>
        )}
        {connection ? (
          <a
            className="home-primary"
            href={viewHref({ plugin: "conversations", view: "workspace" })}
            onClick={linkClick}
          >
            进入工作台 <ArrowIcon />
          </a>
        ) : (
          <button
            className="home-primary"
            type="button"
            disabled={busy}
            onClick={openLogin}
          >
            {loginLabel}
            <ArrowIcon />
          </button>
        )}
      </header>
      {connection ? (
        <HomeConversations
          key={connection.identity}
          connection={connection}
          linkClick={linkClick}
        />
      ) : (
        <p className="home-login-hint">连接你的工作空间，开始一个对话。</p>
      )}
      {shortcuts.length > 0 && (
        <nav className="home-shortcuts" aria-label="首页快捷入口">
          {shortcuts.map((target) => (
            <a key={target.plugin} href={viewHref(target)} onClick={linkClick}>
              <span>
                <strong>{target.title}</strong>
                <span>{target.description}</span>
              </span>
              <ArrowIcon />
            </a>
          ))}
        </nav>
      )}
    </section>
  );
}
