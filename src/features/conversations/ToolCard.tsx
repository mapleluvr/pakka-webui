import type { PocketMessage, PocketPart } from "@pakka/protocol/pocket";
import {
  TextContent,
  ContentHeading,
  type ContentBindings,
} from "./TextContent.js";
import type { ReactNode } from "react";
import { ImageContent } from "./ImageContent.js";
import { useDisclosure } from "./ReadingState.js";
import type { ToolContent } from "./transcript.js";
import { ToolDetails, toolSource } from "./ToolDetails.js";

export function Thinking({
  part,
  identity,
  ...bindings
}: ContentBindings & {
  part: Extract<PocketPart, { type: "thinking" }>;
  identity: string;
}) {
  const [open, setOpen] = useDisclosure(identity);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Thinking</summary>
      {open && (
        <TextContent
          panel={{ title: "思考摘要" }}
          text={part.thinking}
          reference={part.contentReference}
          {...bindings}
        />
      )}
    </details>
  );
}
export function MessageBody({
  message,
  identity,
  heading,
  extraActions,
  ...bindings
}: ContentBindings & {
  message: PocketMessage;
  identity: string;
  heading?: ReactNode;
  extraActions?: ReactNode;
}) {
  const format = message.role === "assistant" ? "markdown" : "text";
  const singleText =
    typeof message.content === "string" ||
    (message.content.length === 1 && message.content[0]?.type === "text");
  return (
    <>
      {heading && !singleText && (
        <ContentHeading heading={heading}>{extraActions}</ContentHeading>
      )}
      {typeof message.content === "string" ? (
        <TextContent
          heading={heading}
          extraActions={extraActions}
          text={message.content}
          reference={message.contentReference}
          format={format}
          {...bindings}
        />
      ) : (
        message.content.map((part, index) => {
          const key = `${identity}/${index}/${part.contentReference?.id ?? "inline"}`;
          switch (part.type) {
            case "text":
              return (
                <TextContent
                  key={key}
                  heading={singleText ? heading : undefined}
                  extraActions={singleText ? extraActions : undefined}
                  text={part.text}
                  reference={part.contentReference}
                  format={format}
                  {...bindings}
                />
              );
            case "thinking":
              return (
                <Thinking key={key} identity={key} part={part} {...bindings} />
              );
            case "image":
              return (
                <ImageContent
                  key={key}
                  data={part.data}
                  mimeType={part.mimeType}
                  reference={part.contentReference}
                  {...bindings}
                />
              );
            default:
              return null; // Rendered once by the transcript's source-aware tool index.
          }
        })
      )}
    </>
  );
}
export function ToolCard({
  tool,
  identity,
  source,
  ...bindings
}: ContentBindings & { tool: ToolContent; identity: string; source: string }) {
  const [open, setOpen] = useDisclosure(identity);
  let status = "调用已记录";
  if (tool.result) status = tool.result.isError ? "失败" : "已结束";
  else if (tool.live)
    status = { pending: "待执行", running: "执行中", done: "已结束" }[
      tool.live.status
    ];
  const src = toolSource(tool);
  const code =
    src?.key === "code"
      ? src.text.replace(/^\s*\/\/ @options:[^\n]*\n/, "")
      : src?.text;
  const excerpt = code?.trim().split(/\r?\n/, 1)[0];
  return (
    <details
      className="message tool-card"
      open={open}
      data-tool-call-id={tool.callId}
      data-source-conversation={source}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="tool-line">
          <strong>{tool.name}</strong>
          <span
            className="tool-status"
            data-error={tool.result?.isError || undefined}
          >
            {status}
          </span>
          {excerpt && <code className="tool-excerpt">{excerpt}</code>}
        </span>
        {!tool.declaration && <small> · 调用声明不在当前页</small>}
        {!!(tool.live?.droppedBytes || tool.live?.droppedLines) && (
          <span className="muted">
            {" "}
            · 源采集已省略 {tool.live?.droppedBytes ?? 0} 字节 /{" "}
            {tool.live?.droppedLines ?? 0} 行
          </span>
        )}
      </summary>
      {open && <ToolDetails tool={tool} identity={identity} {...bindings} />}
    </details>
  );
}
