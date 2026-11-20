import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { ViewTarget } from "@pakka/webui-sdk";
import { parseViewHref, viewHref } from "../host/links.js";
import type {
  OpenView,
  RegistrySnapshot,
  UiRegistry,
} from "../host/registry.js";

const address = (view: OpenView) =>
  viewHref({
    plugin: view.plugin,
    view: view.view,
    resource: view.ui.resource,
  });
export function useViewNavigation(
  registry: UiRegistry,
  snapshot: RegistrySnapshot,
  prepare?: (target: ViewTarget) => Promise<void>,
) {
  const [active, setActive] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const known = useRef(new Set<string>());
  const publications = useRef(snapshot.navigation);
  const fromRoute = useRef(new Set<string>());
  const scroll = useRef(new Map<string, number>());
  const route = useRef<() => void>(() => {});
  const select = useCallback(
    (id: string | null, mode: "push" | "replace" | "existing" = "push") => {
      const view = registry
        .getSnapshot()
        .instances.find((item) => item.id === id);
      if (id && !view) return;
      if (activeRef.current)
        scroll.current.set(activeRef.current, window.scrollY);
      activeRef.current = id;
      setActive(id);
      setUnavailable(null);
      const href = view ? address(view) : "#/";
      if (
        mode !== "existing" &&
        (location.hash !== href || history.state?.pakkaView !== id)
      )
        history[mode === "push" ? "pushState" : "replaceState"](
          { pakkaView: id },
          "",
          href,
        );
    },
    [registry],
  );
  useEffect(
    () =>
      registry.onClose((view) => {
        if (activeRef.current !== view.id) return;
        select(
          registry
            .getSnapshot()
            .instances.filter(
              (item) =>
                item.placement === "page" || item.placement === "settings",
            )
            .at(-1)?.id ?? null,
          "replace",
        );
      }),
    [registry, select],
  );
  useEffect(() => {
    const publicationChanged = publications.current !== snapshot.navigation;
    publications.current = snapshot.navigation;
    const created = snapshot.instances.filter(
      (view) =>
        !known.current.has(view.id) &&
        (view.placement === "page" || view.placement === "settings"),
    );
    known.current = new Set(snapshot.instances.map((view) => view.id));
    const last = created.at(-1);
    if (last)
      select(last.id, fromRoute.current.delete(last.id) ? "existing" : "push");
    else if (activeRef.current && !known.current.has(activeRef.current)) {
      if (publicationChanged) {
        // Keep the stable destination while a connection/publication is unavailable.
        activeRef.current = null;
        setActive(null);
        setUnavailable("此界面尚未装载，请先连接 Pakka 或核对插件状态。");
      } else
        select(
          snapshot.instances
            .filter(
              (view) =>
                view.placement === "page" || view.placement === "settings",
            )
            .at(-1)?.id ?? null,
          "replace",
        );
    }
    for (const id of scroll.current.keys())
      if (!known.current.has(id)) scroll.current.delete(id);
  }, [snapshot.instances, snapshot.navigation, select]);
  useEffect(() => {
    route.current = () => {
      if (!location.hash || location.hash === "#/") {
        select(null, "existing");
        return;
      }
      try {
        const target = parseViewHref(location.hash);
        if (!target) return;
        const href = viewHref(target),
          views = registry.getSnapshot().instances;
        const existing =
          views.find(
            (view) =>
              view.id === history.state?.pakkaView && address(view) === href,
          ) ?? views.find((view) => address(view) === href);
        if (existing) {
          select(existing.id, "existing");
          return;
        }
        if (!registry.hasView(target)) {
          activeRef.current = null;
          setActive(null);
          setUnavailable("此界面尚未装载，请先连接 Pakka 或核对插件状态。");
          if (prepare)
            void prepare(target)
              .then(() => {
                if (location.hash === href && registry.hasView(target))
                  route.current();
              })
              .catch(() => {
                if (location.hash === href)
                  setUnavailable("原资源或插件当前不可用，请核对权限后刷新。");
              });
          return;
        }
        const id = registry.open(target);
        fromRoute.current.add(id);
        history.replaceState({ pakkaView: id }, "", href);
        select(id, "existing");
      } catch {
        setUnavailable("界面链接无效或当前不可用。");
      }
    };
    const update = () => route.current();
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    update();
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, [registry, snapshot.navigation, select, prepare]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      window.scrollTo({
        top: active ? (scroll.current.get(active) ?? 0) : 0,
        behavior: "instant",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active]);
  function linkClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (event.currentTarget.hash === location.hash) {
      event.preventDefault();
      route.current();
    }
  }
  return { active, unavailable, select, linkClick };
}
