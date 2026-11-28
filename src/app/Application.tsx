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
import type { UiRegistry } from "../host/registry.js";
import {
  useIdentityControls,
  type LoginCredential,
} from "../features/identity/IdentityControls.js";
import type { usePakkaConnection } from "../features/identity/usePakkaConnection.js";
import { useViewNavigation } from "./useViewNavigation.js";
import {
  appearanceMode,
  useAppearance,
} from "../features/settings/appearance.js";
import "./palettes.css";
import { NoticeViewport } from "./NoticeViewport.js";
import { WorkspaceNavigation } from "./WorkspaceNavigation.js";
import { DeskDivider } from "../ui/DeskDivider.js";
import { BrandMark } from "../ui/BrandMark.js";
import { HomeView } from "./HomeView.js";
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
  const themeMode = appearanceMode(preferences);
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
  useEffect(() => {
    for (const icon of document.querySelectorAll<HTMLLinkElement>(
      "link[data-brand-icon]",
    )) {
      const mode = icon.dataset.brandIcon;
      if (themeMode === "system") {
        icon.media = `(prefers-color-scheme: ${mode})`;
      } else {
        icon.media = themeMode === mode ? "all" : "not all";
      }
    }
  }, [themeMode]);
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
    <Theme theme={neutralTheme} mode={themeMode}>
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
          <a
            className="brand"
            href="#/"
            onClick={linkClick}
            aria-label="Pakka 首页"
          >
            <BrandMark />
            <span>Pakka</span>
          </a>
        </header>
        <aside
          id="workspace-sidebar"
          className="sidebar"
          aria-label="工作区导航"
        >
          <DeskDivider kind="sidebar" controls="workspace-sidebar" />
          <a
            className="brand"
            href="#/"
            onClick={linkClick}
            aria-label="Pakka 首页"
          >
            <BrandMark />
            <span>Pakka</span>
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
            <HomeView
              connection={identity.connection}
              busy={identity.busy}
              unavailable={navigation.unavailable}
              navigation={state.navigation}
              linkClick={linkClick}
              openLogin={identityControls.openLogin}
            />
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
        <NoticeViewport
          registry={registry}
          notices={state.notices}
          announcement={state.announcement}
        />
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
            <a
              className="brand"
              href="#/"
              onClick={linkClick}
              aria-label="Pakka 首页"
            >
              <BrandMark />
              <span>Pakka</span>
            </a>
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
