import {
  useEffect,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import type { ViewTarget } from "@pakka/webui-sdk";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { Dialog } from "@astryxdesign/core/Dialog";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Button } from "@astryxdesign/core/Button";
import { InstanceView, CloseIcon } from "../host/InstanceView.js";
import { viewHref } from "../host/links.js";
import type { UiRegistry } from "../host/registry.js";
import {
  useIdentityControls,
  type LoginCredential,
} from "../features/identity/IdentityControls.js";
import type { usePakkaConnection } from "../features/identity/usePakkaConnection.js";
import { useViewNavigation } from "./useViewNavigation.js";
import { useAppearance } from "../features/settings/appearance.js";
import { WorkspaceNavigation } from "./WorkspaceNavigation.js";
import "./workspace.css";

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
export function Application({
  registry,
  identity,
  initialCredential,
  refreshExtensions,
  prepareView,
}: {
  registry: UiRegistry;
  identity: ReturnType<typeof usePakkaConnection>;
  initialCredential?: LoginCredential;
  refreshExtensions(): Promise<void>;
  prepareView(target: ViewTarget): Promise<void>;
}) {
  const { preferences } = useAppearance();
  const state = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  const navigation = useViewNavigation(registry, state, prepareView);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    const current = state.instances.find(
      (view) => view.id === navigation.active,
    );
    document.title = current ? `${current.title} · Pakka` : "Pakka";
  }, [navigation.active, state.instances]);
  useEffect(() => setNavOpen(false), [navigation.active]);
  function linkClick(event: MouseEvent<HTMLAnchorElement>) {
    navigation.linkClick(event);
    if (
      !event.button &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    )
      setNavOpen(false);
  }
  function select(id: string) {
    navigation.select(id);
    setNavOpen(false);
  }
  function close(id: string) {
    registry.close(id);
    setNavOpen(false);
    requestAnimationFrame(() =>
      document.getElementById("main")?.focus({ preventScroll: true }),
    );
  }
  const pages = (
    <WorkspaceNavigation
      state={state}
      active={navigation.active}
      linkClick={linkClick}
      select={select}
      close={close}
    />
  );
  const identityControls = useIdentityControls({
    ...identity,
    initialCredential,
  });
  return (
    <Theme theme={neutralTheme} mode={preferences.mode}>
      <a className="skip-link" href="#main">
        跳到内容
      </a>
      <div className="workspace">
        <header className="mobile-workspace-heading">
          <IconButton
            className="icon-button"
            label="打开工作区导航"
            icon={<MenuIcon />}
            variant="ghost"
            onClick={() => setNavOpen(true)}
          />
          <a className="brand" href="#/" onClick={linkClick}>
            Pakka
          </a>
          <span className="brand-caption">Workspace</span>
        </header>
        <aside className="sidebar" aria-label="工作区导航">
          <a className="brand" href="#/" onClick={linkClick}>
            Pakka<span className="brand-caption">Workspace</span>
          </a>
          {pages}
          {identity.connection && (
            <Button
              label="刷新插件"
              variant="ghost"
              clickAction={refreshExtensions}
            />
          )}
          {identityControls.controls}
        </aside>
        <main id="main" className="main" tabIndex={-1}>
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
                    onClick={linkClick}
                  >
                    浏览 Conversations
                  </a>
                )}
                <a
                  className="text-link"
                  href={viewHref({ plugin: "playground", view: "home" })}
                  onClick={linkClick}
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
      <Dialog
        isOpen={navOpen}
        width={360}
        maxHeight="90dvh"
        onOpenChange={setNavOpen}
        aria-label="工作区导航"
      >
        <div className="navigation-sheet">
          <header className="pane-heading">
            <strong>Pakka</strong>
            <IconButton
              className="icon-button"
              label="关闭工作区导航"
              icon={<CloseIcon />}
              variant="ghost"
              onClick={() => setNavOpen(false)}
            />
          </header>
          {pages}
          {identity.connection && (
            <Button
              label="刷新插件"
              variant="ghost"
              clickAction={refreshExtensions}
            />
          )}
          {identityControls.controls}
        </div>
      </Dialog>
      {identityControls.dialog}
    </Theme>
  );
}
