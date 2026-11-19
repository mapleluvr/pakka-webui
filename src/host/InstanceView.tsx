import { Component, type ReactNode } from "react";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { UiContextProvider } from "@pakka/webui-sdk/react";
import type { OpenView, UiRegistry } from "./registry.js";

export function CloseIcon() {
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
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
class ViewBoundary extends Component<
  { children: ReactNode; close(): void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <section role="alert" className="surface flow">
        <h2>界面暂不可用</h2>
        <p>可以关闭后重新打开。已提交的操作仍由所属服务管理。</p>
        <Button label="关闭界面" onClick={this.props.close} />
      </section>
    ) : (
      this.props.children
    );
  }
}
export function InstanceView({
  view,
  registry,
  active,
}: {
  view: OpenView;
  registry: UiRegistry;
  active: boolean;
}) {
  const close = () => registry.close(view.id);
  const content = (
    <UiContextProvider value={view.ui}>
      <ViewBoundary close={close}>{view.render()}</ViewBoundary>
    </UiContextProvider>
  );
  if (view.placement === "sheet" || view.placement === "panel") {
    return (
      <Dialog
        isOpen
        width={640}
        maxHeight="90dvh"
        onOpenChange={(value) => {
          if (!value) close();
        }}
        aria-label={view.title}
      >
        <Layout
          header={
            <LayoutHeader>
              <header className="pane-heading">
                <h2>{view.title}</h2>
                <IconButton
                  className="icon-button"
                  label={`关闭${view.title}`}
                  icon={<CloseIcon />}
                  variant="ghost"
                  onClick={close}
                />
              </header>
            </LayoutHeader>
          }
          content={<LayoutContent label={view.title}>{content}</LayoutContent>}
        />
      </Dialog>
    );
  }
  return (
    <article hidden={!active} className="page" aria-label={view.title}>
      {content}
    </article>
  );
}
