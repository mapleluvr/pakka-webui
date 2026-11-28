import { useLayoutEffect, useRef } from "react";
/** Keep only geometry, never source bytes, when changing notebook pages. */
export function useNotebookScroll(view: string, ready: boolean) {
  const content = useRef<HTMLDivElement>(null),
    positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const pane = content.current?.closest<HTMLElement>(
      ".conversation-panel-body",
    );
    if (!pane || !ready) return;
    pane.scrollTop = positions.current.get(view) ?? 0;
    const remember = () => positions.current.set(view, pane.scrollTop);
    pane.addEventListener("scroll", remember);
    return () => pane.removeEventListener("scroll", remember);
  }, [view, ready]);
  return content;
}
/** Capture the visible stable row before the dock changes the reader's line wrapping. */
export function preserveReaderAnchor(button: HTMLElement | null) {
  if (window.innerWidth < 1280) return;
  const reader = button
    ?.closest(".conversation-view")
    ?.querySelector<HTMLElement>(".conversation-reading");
  if (!reader) return;
  const top = reader.getBoundingClientRect().top;
  const row = [
    ...reader.querySelectorAll<HTMLElement>("[data-transcript-key]"),
  ].find((r) => r.getBoundingClientRect().bottom > top);
  if (!row) return;
  const offset = row.getBoundingClientRect().top - top;
  let frames = 3;
  function restore() {
    if (!reader || !row?.isConnected) return;
    reader.scrollTop +=
      row.getBoundingClientRect().top -
      reader.getBoundingClientRect().top -
      offset;
    if (--frames) requestAnimationFrame(restore);
  }
  requestAnimationFrame(restore);
}
