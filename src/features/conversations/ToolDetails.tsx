import type { ReactNode } from "react";
import type { PocketMessage, PocketPart } from "@pakka/protocol/pocket";
import { TextContent, type ContentBindings } from "./TextContent.js";
import { ImageContent } from "./ImageContent.js";
import { useDisclosure } from "./ReadingState.js";
import { codeEnvelope, codeSections } from "./codemode-preview.js";
import { readableThought, type ToolContent } from "./transcript.js";

const shellTool = /^(?:powershell|pwsh|bash|sh|shell|zsh|cmd)$/i;
export function toolSource(tool: ToolContent) {
  const key = tool.name === "codemode" ? "code" : "command";
  if (key === "command" && !shellTool.test(tool.name)) return;
  const text = tool.declaration?.arguments[key];
  if (typeof text === "string" && text.trim())
    return { key, text, title: key === "code" ? "JavaScript" : "命令" };
}

function Fold({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useDisclosure(id);
  return (
    <details
      className="tool-disclosure"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{title}</summary>
      {open && <div className="tool-disclosure-body">{children}</div>}
    </details>
  );
}
function OutputText({
  part,
  title,
  shell,
  ...bindings
}: ContentBindings & {
  part: Extract<PocketPart, { type: "text" }>;
  title: string;
  shell: string;
}) {
  let text = part.text;
  // Refine the preview only when the unmodified archived part remains available.
  if (part.contentReference?.source === "entry" && shellTool.test(shell)) {
    const exit =
      /^<harness>\r?\n\[error\] Command exited with code (-?\d+)\r?\n<\/harness>\s*$/.exec(
        text,
      );
    if (exit) {
      title = "退出信息";
      text = `进程退出码：${exit[1]}`;
    } else {
      // Some PowerShell projections already stripped ESC but retained paired SGR field decoration.
      if (/^(?:powershell|pwsh)$/i.test(shell))
        text = text.replace(/\[32;1m([^\r\n\[\]]{1,160})\[0m/g, "$1");
    }
  }
  return (
    <TextContent
      panel={{ title }}
      text={text}
      reference={part.contentReference}
      {...bindings}
    />
  );
}

function CodeOutput({
  part,
  failed,
  ...bindings
}: ContentBindings & {
  part: Extract<PocketPart, { type: "text" }>;
  failed: boolean;
}) {
  const sections =
    part.contentReference?.previewComplete === false
      ? undefined
      : codeSections(part.text, failed);
  return (
    <TextContent
      panel={{ title: "脚本输出", originalTitle: "输出片段" }}
      text={part.text}
      reference={part.contentReference}
      preview={
        sections && (
          <div className="tool-sections">
            {sections.map((s, i) => (
              <section key={`${i}/${s.title}`}>
                <h5>{s.title}</h5>
                <pre>{s.text}</pre>
              </section>
            ))}
          </div>
        )
      }
      {...bindings}
    />
  );
}
function ResultPanels({
  result,
  name,
  elapsed,
  ...bindings
}: ContentBindings & {
  result: PocketMessage;
  name: string;
  elapsed?: string;
}) {
  const parts =
    typeof result.content === "string"
      ? [
          {
            type: "text" as const,
            text: result.content,
            contentReference: result.contentReference,
          },
        ]
      : result.content;

  function show(part: PocketPart, i: number) {
    const key = part.contentReference?.id ?? i;
    switch (part.type) {
      case "text":
        if (elapsed && i === 0)
          return parts.length === 1 ? (
            <p key={key} className="muted">
              脚本未返回输出。
            </p>
          ) : null;
        if (elapsed)
          return (
            <CodeOutput
              key={key}
              part={part}
              failed={Boolean(result.isError)}
              {...bindings}
            />
          );
        return (
          <OutputText
            key={key}
            part={part}
            title={i ? `输出 ${i + 1}` : "输出"}
            shell={name}
            {...bindings}
          />
        );
      case "image":
        return (
          <section className="tool-panel" key={key} aria-label="输出图片">
            <header className="tool-panel-heading">
              <h4>输出图片</h4>
            </header>
            <ImageContent
              data={part.data}
              mimeType={part.mimeType}
              reference={part.contentReference}
              {...bindings}
            />
          </section>
        );
      case "thinking":
        return (
          readableThought(part) && (
            <TextContent
              key={key}
              panel={{ title: "思考摘要" }}
              text={part.thinking}
              reference={part.contentReference}
              {...bindings}
            />
          )
        );
      default:
        return null;
    }
  }
  return (
    <>
      {parts.map(show)}
      {result.errorMessage && (
        <TextContent
          panel={{ title: "错误信息" }}
          text={result.errorMessage}
          reference={result.errorReference}
          {...bindings}
        />
      )}
    </>
  );
}

export function ToolDetails({
  tool,
  identity,
  ...bindings
}: ContentBindings & { tool: ToolContent; identity: string }) {
  const { declaration } = tool,
    source = toolSource(tool);
  const options =
    source && declaration
      ? Object.fromEntries(
          Object.entries(declaration.arguments).filter(
            ([key]) => key !== source.key,
          ),
        )
      : undefined;
  const hasOptions = options && Object.keys(options).length > 0;
  const args = declaration && (
    <TextContent
      panel={{ title: source?.title ?? "参数", originalTitle: "参数" }}
      text={source?.text ?? JSON.stringify(declaration.arguments, null, 2)}
      reference={declaration.contentReference}
      {...bindings}
    />
  );
  const isCode = tool.name === "codemode";
  const parts = tool.result?.content;
  const elapsed =
    isCode && Array.isArray(parts)
      ? codeEnvelope(parts, Boolean(tool.result?.isError))
      : undefined;
  const header =
    elapsed && Array.isArray(parts)
      ? (parts[0] as Extract<PocketPart, { type: "text" }>)
      : undefined;
  let output: ReactNode;
  if (tool.result)
    output = (
      <ResultPanels
        result={tool.result}
        name={tool.name}
        elapsed={elapsed}
        {...bindings}
      />
    );
  else if (tool.live?.output)
    output = (
      <TextContent
        panel={{ title: "当前输出" }}
        text={tool.live.output}
        reference={tool.live.contentReference}
        {...bindings}
      />
    );
  return (
    <div className="tool-details">
      {isCode && source ? (
        <Fold id={`${identity}/script`} title="脚本 · JavaScript">
          {args}
        </Fold>
      ) : (
        args
      )}
      {isCode && output ? (
        <Fold
          id={`${identity}/output`}
          title={elapsed ? `脚本结果 · ${elapsed}` : "脚本结果"}
        >
          {output}
        </Fold>
      ) : (
        output
      )}
      <details className="tool-metadata">
        <summary>{hasOptions ? "其他参数与调用信息" : "调用信息"}</summary>
        {header && (
          <TextContent
            panel={{ title: "运行记录" }}
            text={header.text}
            reference={header.contentReference}
            {...bindings}
          />
        )}
        {hasOptions && (
          <TextContent
            panel={{ title: "其他参数" }}
            text={JSON.stringify(options, null, 2)}
            {...bindings}
          />
        )}
        <p>
          <span>调用 ID</span> <code>{tool.callId}</code>
        </p>
      </details>
    </div>
  );
}
