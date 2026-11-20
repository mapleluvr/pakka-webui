import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { CloseIcon } from "../host/InstanceView.js";
import { viewHref } from "../host/links.js";
import type { RegistrySnapshot } from "../host/registry.js";

export function WorkspaceNavigation({
  state,
  active,
  linkClick,
  select,
  close,
}: {
  state: RegistrySnapshot;
  active: string | null;
  linkClick(event: MouseEvent<HTMLAnchorElement>): void;
  select(id: string): void;
  close(id: string): void;
}) {
  const current = state.instances.find((view) => view.id === active);
  const [settingsOpen, setSettingsOpen] = useState(
    current?.placement === "settings",
  );
  useEffect(() => {
    if (current?.placement === "settings") setSettingsOpen(true);
  }, [current?.placement]);
  const pages = state.navigation
    .filter((item) => item.placement !== "settings")
    .sort(
      (a, b) =>
        Number(b.plugin === "conversations") -
        Number(a.plugin === "conversations"),
    );
  const settings = state.navigation.filter(
    (item) => item.placement === "settings",
  );
  const opened = state.instances.filter(
    (view) => view.placement === "page" || view.placement === "settings",
  );
  return (
    <div className="workspace-navigation">
      <nav className="nav-list" aria-label="功能">
        <p className="nav-caption">工作台</p>
        {pages.map((item) => (
          <a
            key={`${item.plugin}/${item.view}`}
            href={viewHref(item)}
            onClick={linkClick}
            aria-current={
              current?.plugin === item.plugin && current.view === item.view
                ? "page"
                : undefined
            }
          >
            {item.title}
          </a>
        ))}
      </nav>
      {opened.length > 0 && (
        <nav className="open-views" aria-label="已打开页面">
          <p className="nav-caption">已打开</p>
          {opened.map((view) => (
            <div
              className="open-view-row"
              key={view.id}
              data-active={view.id === active || undefined}
            >
              <button
                type="button"
                className="open-view-button"
                aria-current={view.id === active ? "page" : undefined}
                title={view.title}
                onClick={() => select(view.id)}
              >
                <span className="open-view-mark" aria-hidden="true" />
                <span>{view.title}</span>
              </button>
              <IconButton
                className="open-view-close"
                label={`关闭${view.title}`}
                icon={<CloseIcon />}
                variant="ghost"
                onClick={() => close(view.id)}
              />
            </div>
          ))}
        </nav>
      )}
      {settings.length > 0 && (
        <details
          className="nav-settings"
          open={settingsOpen}
          onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
        >
          <summary>设置</summary>
          <nav className="nav-list" aria-label="设置分类">
            {settings.map((item) => (
              <a
                key={`${item.plugin}/${item.view}`}
                href={viewHref(item)}
                onClick={linkClick}
                aria-current={
                  current?.plugin === item.plugin && current.view === item.view
                    ? "page"
                    : undefined
                }
              >
                {item.title}
              </a>
            ))}
          </nav>
        </details>
      )}
    </div>
  );
}
