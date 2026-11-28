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
import { UiIcon } from "@pakka/webui-sdk/icons";
import { ToolDetails } from "./ToolDetails.js";
import { firstLine, toolPresentation } from "./tool-presentation.js";
import { readableThought } from "./transcript.js";

export function Thinking({
  part,
  identity,
  actions,
  ...bindings
}: ContentBindings & {
  part: Extract<PocketPart, { type: "thinking" }>;
  identity: string;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useDisclosure(identity);
  if (!readableThought(part)) return null;
  return (
    <details
      className="thought-row"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="thought-summary">
        <UiIcon name="thought" />
        <span>Thinking</span>
        <span className="thought-excerpt">{firstLine(part.thinking)}</span>
        <UiIcon name="chevron" className="activity-chevron" />
      </summary>
      {open && (
        <TextContent
          panel={{ title: "思考摘要" }}
          extraActions={actions}
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
  actions,
  ...bindings
}: ContentBindings & {
  tool: ToolContent;
  identity: string;
  source: string;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useDisclosure(identity);
  let status = "调用已记录";
  if (tool.result) status = tool.result.isError ? "失败" : "已结束";
  else if (tool.live)
    status = { pending: "待执行", running: "执行中", done: "已结束" }[
      tool.live.status
    ];
  const presentation = toolPresentation(tool);
  const { excerpt, icon, elapsed } = presentation;
  const running = !tool.result && tool.live?.status === "running";
  return (
    <details
      className="tool-card"
      open={open}
      data-tool-call-id={tool.callId}
      data-source-conversation={source}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="tool-summary">
        <UiIcon name={icon} />
        <code className="tool-excerpt">{excerpt || tool.name}</code>
        <span className="tool-trailing">
          {excerpt && <span className="tool-kind">{tool.name}</span>}
          <span
            className="tool-status"
            data-error={tool.result?.isError || undefined}
          >
            {tool.result && (
              <UiIcon name={tool.result.isError ? "error" : "check"} />
            )}
            {running && <UiIcon className="activity-spinner" name="spinner" />}
            {status}
            {elapsed && ` · ${elapsed}`}
          </span>
        </span>
        <UiIcon name="chevron" className="activity-chevron" />
      </summary>
      {open && (
        <ToolDetails
          tool={tool}
          identity={identity}
          presentation={presentation}
          actions={actions}
          {...bindings}
        />
      )}
    </details>
  );
}
