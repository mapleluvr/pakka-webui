import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ModelCatalogItem, ModelCatalogPage } from "@pakka/protocol/webui";

import { modelIdentityKey } from "./modelCatalog.js";

/** Touch pans remain native. Only a stationary release on the same catalog row can set a default. */
export function useModelHold(
  list: RefObject<HTMLUListElement | null>,
  page: ModelCatalogPage | null,
  onHold: ((model: ModelCatalogItem) => void) | undefined,
) {
  const latest = useRef(onHold),
    suppress = useRef(false);
  useLayoutEffect(() => {
    latest.current = onHold;
  });
  const enabled = !!onHold;
  useLayoutEffect(() => {
    const root = list.current;
    if (!enabled || !root) return;
    let touch: {
      id: number;
      row: HTMLElement;
      model: ModelCatalogItem;
      x: number;
      y: number;
      start: number;
    } | null = null;
    function cancel() {
      if (touch) {
        suppress.current = true;
        touch = null;
      }
    }
    function down(e: PointerEvent) {
      if (!e.isPrimary || touch) {
        cancel();
        suppress.current = true;
        return;
      }
      suppress.current = false;
      if (e.pointerType !== "touch" || e.button !== 0) return;
      const row =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("[data-model]")
          : null;
      if (!row || !root!.contains(row)) return;
      const model = page?.models.find(
        (m) => modelIdentityKey(m) === row.dataset.model,
      );
      if (!model) return;
      touch = {
        id: e.pointerId,
        row,
        model,
        x: e.clientX,
        y: e.clientY,
        start: e.timeStamp,
      };
    }
    function moved(e: PointerEvent) {
      if (
        touch &&
        e.pointerId === touch.id &&
        (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 9 ||
          !touch.row.contains(document.elementFromPoint(e.clientX, e.clientY)))
      )
        cancel();
    }
    function release(e: PointerEvent) {
      moved(e);
      if (!touch || e.pointerId !== touch.id) return;
      const held = touch;
      touch = null;
      if (
        !held.row.isConnected ||
        held.row.dataset.model !== modelIdentityKey(held.model)
      ) {
        suppress.current = true;
        return;
      }
      if (e.timeStamp - held.start >= 550) {
        suppress.current = true;
        latest.current?.(held.model);
      }
    }
    function context(e: Event) {
      if (touch) e.preventDefault();
    }
    function leave(e: PointerEvent) {
      if (touch?.row === e.target) cancel();
    }
    const c = new AbortController(),
      capture = { capture: true, signal: c.signal };
    window.addEventListener("pointerdown", down, capture);
    window.addEventListener("pointermove", moved, capture);
    window.addEventListener("pointerup", release, capture);
    window.addEventListener("pointercancel", cancel, capture);
    window.addEventListener("scroll", cancel, capture);
    window.addEventListener("blur", cancel, capture);
    document.addEventListener("visibilitychange", cancel, capture);
    root.addEventListener("pointerleave", leave, capture);
    root.addEventListener("contextmenu", context, { signal: c.signal });
    return () => {
      cancel();
      c.abort();
    };
  }, [list, page, enabled]);
  return (event: React.MouseEvent) => {
    if (suppress.current && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}
