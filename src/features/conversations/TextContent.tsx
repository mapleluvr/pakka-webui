import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { createPortal } from "react-dom";
import { CopyIcon, OriginalIcon } from "./ReadingIcons.js";
import type { PocketContentReference } from "@pakka/protocol/pocket";
import type { UiContext } from "@pakka/webui-sdk";
import { OriginalContent } from "./OriginalContent.js";
import type { ContentSource } from "../../integrations/pakka/content.js";
import { useOriginalDisclosure, useReadingControls } from "./ReadingState.js";

export type ContentBindings = Omit<ContentSource, "reference"> & {
  ui: UiContext;
};

function CopyButton({
  text,
  label = "复制显示内容",
  compact = false,
}: {
  text: () => string;
  label?: string;
  compact?: boolean;
}) {
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const copy = () => {
    if (!navigator.clipboard) {
      setNotice("当前浏览器无法复制，请选择文字后复制。");
      return;
    }
    void navigator.clipboard.writeText(text()).then(
      () => {
        if (active.current) setNotice("已复制。");
      },
      () => {
        if (active.current) setNotice("未能复制，请检查浏览器权限。");
      },
    );
  };
  return (
    <div className="copy-action">
      {compact ? (
        <IconButton
          label={label}
          icon={<CopyIcon />}
          variant="ghost"
          onClick={copy}
        />
      ) : (
        <Button label={label} variant="ghost" onClick={copy} />
      )}
      {notice && (
        <span role="status" className="muted">
          {notice}
        </span>
      )}
    </div>
  );
}
function CodeBlock({ children }: { children?: ReactNode }) {
  const node = useRef<HTMLPreElement>(null);
  return (
    <div className="code-block">
      <CopyButton
        label="复制代码"
        text={() => node.current?.textContent ?? ""}
      />
      <pre ref={node} tabIndex={0}>
        {children}
      </pre>
    </div>
  );
}
const markdownComponents = {
  pre: CodeBlock,
  a: ({ href, children }: { href?: string; children?: ReactNode }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Remote image markup remains a user-activated link, not an automatic external request.
  img: ({ src, alt }: { src?: string; alt?: string }) =>
    src ? (
      <a href={src} target="_blank" rel="noopener noreferrer">
        图片：{alt || "打开图片链接"}
      </a>
    ) : (
      <span>{alt || "图片链接不可用"}</span>
    ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="markdown-table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
};

export function ContentHeading({
  heading,
  children,
}: {
  heading: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="message-heading">
      <span className="message-label">{heading}</span>
      <div className="message-actions">{children}</div>
    </header>
  );
}

export function TextContent({
  text,
  reference,
  format = "text",
  heading,
  extraActions,
  ...bindings
}: ContentBindings & {
  heading?: ReactNode;
  extraActions?: ReactNode;
  text: string;
  reference?: PocketContentReference;
  format?: "markdown" | "text" | "json";
}) {
  const [open, setOpen] = useOriginalDisclosure(
    `text:${JSON.stringify([bindings.conversation, reference])}`,
  );
  const original =
    reference?.source === "entry" && reference.encoding !== "base64";
  const originalView = useRef<HTMLDivElement>(null);
  const originalToggle = useRef<HTMLButtonElement>(null);
  const controls = useReadingControls();
  const reveal = useRef(false);
  useLayoutEffect(() => {
    if (!open || !original || !reveal.current) return;
    reveal.current = false;
    originalView.current?.focus({ preventScroll: true });
    originalView.current?.scrollIntoView({ block: "start", inline: "nearest" });
    // Short windows may show less than the original-content toolbar. Reveal
    // its search field while keeping focus off editable controls.
    originalView.current
      ?.querySelector("input")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open, original]);
  function closeOriginal() {
    setOpen(false);
    requestAnimationFrame(() => originalToggle.current?.focus());
  }
  function toggleOriginal() {
    reveal.current = !open;
    if (open) closeOriginal();
    else setOpen(true);
  }
  const actions = (
    <>
      {!(open && original) && (
        <CopyButton text={() => text} compact={Boolean(heading)} />
      )}
      {original &&
        (heading ? (
          <IconButton
            ref={originalToggle}
            label={open ? "收起原文" : "原文与搜索"}
            icon={<OriginalIcon />}
            variant="ghost"
            onClick={toggleOriginal}
          />
        ) : (
          <Button
            ref={originalToggle}
            label={open ? "收起原文" : "原文与搜索"}
            variant="ghost"
            onClick={toggleOriginal}
          />
        ))}
      {extraActions}
    </>
  );
  return (
    <div className="content-body flow compact">
      {open &&
        original &&
        controls &&
        createPortal(
          <Button
            className="original-back-control"
            label="返回消息预览"
            variant="ghost"
            onClick={closeOriginal}
          />,
          controls,
        )}
      {heading && <ContentHeading heading={heading}>{actions}</ContentHeading>}
      {!(open && original) &&
        (format === "markdown" ? (
          <div className="markdown-body">
            <Markdown
              skipHtml
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {text}
            </Markdown>
          </div>
        ) : format === "json" ? (
          <pre tabIndex={0}>{text}</pre>
        ) : (
          <p className="message-text">{text}</p>
        ))}
      {!heading && <div className="actions">{actions}</div>}
      {!open && reference && !reference.previewComplete && (
        <p className="muted">
          当前显示的是预览。
          {original
            ? "完整内容可分段阅读、搜索或下载。"
            : "活动内容仍在变化，请在归档后读取完整原文。"}
        </p>
      )}
      {open && original && (
        <div className="original-view" ref={originalView} tabIndex={-1}>
          <OriginalContent
            key={JSON.stringify(reference)}
            ui={bindings.ui}
            source={{
              connection: bindings.connection,
              conversation: bindings.conversation,
              reference,
            }}
          />
        </div>
      )}
    </div>
  );
}
