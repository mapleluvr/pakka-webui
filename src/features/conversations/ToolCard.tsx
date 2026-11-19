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

function Thinking({
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
            case "toolCall":
              return null; // Rendered once by the transcript's source-aware tool index.
          }
        })
      )}
      {message.errorMessage && (
        <div className="error-text">
          <TextContent
            text={message.errorMessage}
            reference={message.errorReference}
            {...bindings}
          />
        </div>
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
  const status = tool.result
    ? tool.result.isError
      ? "失败"
      : "已结束"
    : tool.live
      ? { pending: "待执行", running: "执行中", done: "已结束" }[
          tool.live.status
        ]
      : "调用已记录";
  const size =
    (tool.declaration?.contentReference?.byteLength ?? 0) +
    (tool.result?.contentReference?.byteLength ?? 0) +
    (Array.isArray(tool.result?.content)
      ? tool.result.content.reduce(
          (sum, part) => sum + (part.contentReference?.byteLength ?? 0),
          0,
        )
      : 0);
  return (
    <details
      className="message tool-card"
      open={open}
      data-tool-call-id={tool.callId}
      data-source-conversation={source}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          工具 · {tool.name} · {status}
        </span>
        <span className="muted">
          {size > 0 && ` · 原文 ${size.toLocaleString()} 字节`}
          {!tool.declaration && " · 调用声明不在当前页"}
        </span>
        {!!(tool.live?.droppedBytes || tool.live?.droppedLines) && (
          <span className="muted">
            {" "}
            · 源采集已省略 {tool.live?.droppedBytes ?? 0} 字节 /{" "}
            {tool.live?.droppedLines ?? 0} 行
          </span>
        )}
      </summary>
      {open && (
        <div className="flow tool-details">
          <p className="muted identifier">调用 {tool.callId}</p>
          {tool.declaration && (
            <section className="flow compact" aria-label="工具参数">
              <h3>参数</h3>
              <TextContent
                text={JSON.stringify(tool.declaration.arguments, null, 2)}
                reference={tool.declaration.contentReference}
                format="json"
                {...bindings}
              />
            </section>
          )}
          {tool.result && (
            <section className="flow compact" aria-label="工具结果">
              <h3>结果</h3>
              <MessageBody
                message={tool.result}
                identity={`${identity}/result`}
                {...bindings}
              />
            </section>
          )}
          {!tool.result && tool.live?.output && (
            <section className="flow compact" aria-label="工具活动输出">
              <h3>当前输出</h3>
              <TextContent
                text={tool.live.output}
                reference={tool.live.contentReference}
                {...bindings}
              />
            </section>
          )}
        </div>
      )}
    </details>
  );
}
