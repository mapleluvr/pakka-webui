import type { ReactNode } from "react";
import type { PocketMessage, PocketPart } from "@pakka/protocol/pocket";
import { TextContent, type ContentBindings } from "./TextContent.js";
import { ImageContent } from "./ImageContent.js";
import { useDisclosure } from "./ReadingState.js";
import { UiIcon } from "@pakka/webui-sdk/icons";
import { codeSections } from "./codemode-preview.js";
import { readableThought, type ToolContent } from "./transcript.js";
import { shellTool, type toolPresentation } from "./tool-presentation.js";

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
      <summary>
        <UiIcon name="chevron" className="activity-chevron" />
        {title}
      </summary>
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
              <section
                key={`${i}/${s.title}`}
                data-error={s.error || undefined}
              >
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
      {(result.errorMessage || result.errorReference) && (
        <TextContent
          panel={{ title: "错误信息" }}
          text={result.errorMessage ?? ""}
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
  presentation: { input: source, elapsed },
  actions,
  ...bindings
}: ContentBindings & {
  tool: ToolContent;
  identity: string;
  presentation: ReturnType<typeof toolPresentation>;
  actions?: ReactNode;
}) {
  const { declaration } = tool;
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
  const header =
    elapsed && Array.isArray(parts)
      ? (parts[0] as Extract<PocketPart, { type: "text" }>)
      : undefined;
  const result = tool.result && (
    <ResultPanels
      result={tool.result}
      name={tool.name}
      elapsed={elapsed}
      {...bindings}
    />
  );
  const live = tool.live;
  const captured =
    live && (live.output || live.contentReference) ? (
      <TextContent
        panel={{ title: result ? "执行期间的输出" : "当前输出" }}
        text={live.output ?? ""}
        reference={live.contentReference}
        {...bindings}
      />
    ) : null;
  const dropped = [
    live?.droppedBytes ? `${live.droppedBytes} 字节` : null,
    live?.droppedLines ? `${live.droppedLines} 行` : null,
  ].filter(Boolean);
  return (
    <div className="tool-details">
      {!isCode && args}
      {!declaration && <p className="tool-note">调用声明不在当前页</p>}
      {result}
      {captured}
      {dropped.length > 0 && (
        <p className="tool-note">源采集已省略 {dropped.join(" / ")}</p>
      )}
      {isCode && args && (
        <Fold
          id={`${identity}/script`}
          title={source ? "脚本 · JavaScript" : "脚本参数"}
        >
          {args}
        </Fold>
      )}
      <footer className="tool-footer">
        <Fold
          id={`${identity}/metadata`}
          title={hasOptions ? "其他参数与调用信息" : "调用信息"}
        >
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
          <p className="tool-note">
            调用 ID · <code>{tool.callId}</code>
          </p>
        </Fold>
        {actions}
      </footer>
    </div>
  );
}
