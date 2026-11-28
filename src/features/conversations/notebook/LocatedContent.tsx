import { useLayoutEffect, useRef } from "react";
import type { EntryRef } from "./source-actions.js";
import { OriginalContent } from "../OriginalContent.js";
import type { ContentBindings } from "../TextContent.js";
export function LocatedContent({
  source,
  bindings,
  back,
}: {
  source: EntryRef;
  bindings: ContentBindings;
  back: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true });
    root.current?.scrollIntoView({ block: "nearest" });
  }, [source]);
  return (
    <section
      className="located-content"
      aria-label="定位的原内容"
      tabIndex={-1}
      ref={root}
    >
      <header>
        <strong>
          {source.kind === "message" ? "消息" : "工具结果"} · Entry{" "}
          {source.content.entryId}
          {source.content.callId && ` · ${source.content.callId}`}
        </strong>
        <button onClick={back}>返回阅读</button>
      </header>
      <OriginalContent
        ui={bindings.ui}
        source={{
          connection: bindings.connection,
          conversation: bindings.conversation,
          reference: source.content,
        }}
      />
    </section>
  );
}
