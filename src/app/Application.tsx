import { useEffect, useSyncExternalStore } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Button } from "@astryxdesign/core/Button";
import { InstanceView, CloseIcon } from "../host/InstanceView.js";
import { viewHref } from "../host/links.js";
import type { UiRegistry } from "../host/registry.js";
import {
  IdentityControls,
  type LoginCredential,
} from "../features/identity/IdentityControls.js";
import type { usePakkaConnection } from "../features/identity/usePakkaConnection.js";
import { useViewNavigation } from "./useViewNavigation.js";

export function Application({
  registry,
  identity,
  initialCredential,
  refreshExtensions,
}: {
  registry: UiRegistry;
  identity: ReturnType<typeof usePakkaConnection>;
  initialCredential?: LoginCredential;
  refreshExtensions(): Promise<void>;
}) {
  const state = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  const navigation = useViewNavigation(registry, state);
  useEffect(() => {
    const current = state.instances.find(
      (view) => view.id === navigation.active,
    );
    document.title = current ? `${current.title} · Pakka` : "Pakka";
  }, [navigation.active, state.instances]);
  return (
    <Theme theme={neutralTheme} mode="light">
      <a className="skip-link" href="#main">
        跳到内容
      </a>
      <div className="workspace">
        <aside className="sidebar" aria-label="工作区导航">
          <a className="brand" href="#/" onClick={navigation.linkClick}>
            Pakka<span className="brand-caption">Workspace</span>
          </a>
          <nav className="nav-list" aria-label="功能">
            {state.navigation.map((item) => (
              <a
                key={`${item.plugin}/${item.view}`}
                href={viewHref(item)}
                onClick={navigation.linkClick}
              >
                {item.title}
              </a>
            ))}
          </nav>
          {identity.connection && (
            <Button
              label="刷新插件"
              variant="ghost"
              clickAction={refreshExtensions}
            />
          )}
          <IdentityControls
            {...identity}
            initialCredential={initialCredential}
          />
        </aside>
        <main id="main" className="main" tabIndex={-1}>
          <nav className="tabs" aria-label="已打开页面">
            {state.instances
              .filter(
                (view) =>
                  view.placement === "page" || view.placement === "settings",
              )
              .map((view) => (
                <button
                  key={view.id}
                  aria-pressed={navigation.active === view.id}
                  onClick={() => navigation.select(view.id)}
                >
                  {view.title}
                </button>
              ))}
          </nav>
          {!navigation.active && (
            <section className="welcome flow">
              <p className="eyebrow">Pakka Workspace</p>
              <h1>打开你的工作空间</h1>
              {navigation.unavailable ? (
                <p role="status">{navigation.unavailable}</p>
              ) : (
                <p className="muted">
                  {identity.connection
                    ? "选择一个 Conversation，继续工作或浏览原历史。"
                    : "连接 Pakka 后进入 Conversations 和设置。组件实验室可独立使用。"}
                </p>
              )}
              <div className="actions">
                {identity.connection && (
                  <a
                    className="text-link"
                    href={viewHref({
                      plugin: "conversations",
                      view: "workspace",
                    })}
                    onClick={navigation.linkClick}
                  >
                    浏览 Conversations
                  </a>
                )}
                <a
                  className="text-link"
                  href={viewHref({ plugin: "playground", view: "home" })}
                  onClick={navigation.linkClick}
                >
                  进入组件实验室
                </a>
              </div>
            </section>
          )}
          {state.instances.map((view) => (
            <InstanceView
              key={view.id}
              view={view}
              registry={registry}
              active={navigation.active === view.id}
            />
          ))}
        </main>
        <section className="notices" aria-label="提示" aria-live="polite">
          {state.notices.map((item) => (
            <div key={item.id} className={`notice notice-${item.tone}`}>
              <p>{item.message}</p>
              <IconButton
                className="icon-button"
                label="关闭提示"
                icon={<CloseIcon />}
                variant="ghost"
                onClick={() => registry.dismiss(item.id)}
              />
            </div>
          ))}
        </section>
      </div>
    </Theme>
  );
}
