import { useId, useRef, useState } from "react";

const protocolNames = new Map<string, string>([
  ["openai-completions", "OpenAI Chat Completions"],
  ["openai-responses", "OpenAI Responses"],
  ["azure-openai-responses", "Azure OpenAI Responses"],
  ["openai-codex-responses", "OpenAI Codex Responses"],
  ["anthropic-messages", "Anthropic Messages"],
  ["google-generative-ai", "Google Generative AI"],
  ["google-vertex", "Google Vertex"],
  ["bedrock-converse-stream", "Amazon Bedrock Converse Stream"],
  ["mistral-conversations", "Mistral Conversations"],
  ["pi-messages", "Pi Messages"],
]);
export function protocolLabel(id: string) {
  const name = protocolNames.get(id);
  return name ? `${name} (${id})` : id;
}
export function ProtocolField({
  label,
  value,
  onChange,
  apis,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  apis: string[];
  disabled?: boolean;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const choices = [...new Set([...protocolNames.keys(), ...apis])];
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(v: string) {
    onChange(v);
    close();
  }
  return (
    <div
      className="protocol-field"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <span id={id}>{label}</span>
      <button
        ref={trigger}
        type="button"
        aria-labelledby={`${id} ${id}-value`}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setOpen(!open);
        }}
      >
        <span id={`${id}-value`}>
          {value ? protocolLabel(value) : "选择协议"}
        </span>
      </button>
      {open && (
        <div className="protocol-options flow compact">
          <label className="field">
            筛选协议名称或 ID
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="protocol-list">
            {choices
              .filter((id) =>
                protocolLabel(id)
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
              )
              .map((id) => (
                <button key={id} onClick={() => choose(id)}>
                  {protocolLabel(id)}
                </button>
              ))}
          </div>
          <div className="actions">
            <button
              disabled={!query.trim()}
              onClick={() => choose(query.trim())}
            >
              输入其他 API ID{query.trim() && `：${query.trim()}`}
            </button>
            <button onClick={() => choose("")}>清除选择</button>
            <button onClick={close}>关闭选择</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
const compatibility: Record<
  string,
  Record<string, readonly string[] | true>
> = {
  "openai-completions": {
    supportsStore: true,
    supportsDeveloperRole: true,
    supportsStrictMode: true,
    maxTokensField: ["max_tokens", "max_completion_tokens"],
    thinkingFormat: [
      "openai",
      "openrouter",
      "deepseek",
      "together",
      "baseten",
      "zai",
      "qwen",
      "chat-template",
      "qwen-chat-template",
      "string-thinking",
      "ant-ling",
    ],
  },
  "openai-responses": {
    supportsAdditionalTools: true,
    supportsMaxOutputTokens: true,
    supportsDeveloperRole: true,
    supportsStrictMode: true,
  },
  "azure-openai-responses": {
    supportsAdditionalTools: true,
    supportsToolSearch: true,
    supportsStrictMode: true,
  },
  "anthropic-messages": {
    supportsTemperature: true,
    supportsEagerToolInputStreaming: true,
    supportsStrictTools: true,
  },
  "mistral-conversations": { supportsMidConvoSystemMessages: true },
  "bedrock-converse-stream": { supportsStrictMode: true },
};
export const compatFor = (api: string) =>
  Object.hasOwn(compatibility, api) ? compatibility[api]! : {};
export const usesSampling = (api: string) =>
  ["openai-completions", "openai-responses", "azure-openai-responses"].includes(
    api,
  );
