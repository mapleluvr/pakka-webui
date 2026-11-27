import { useState, type ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { ActivityItem } from "./transcript.js";
import { modelLabel } from "./reply-diagnostics.js";
import { ReadingIcon } from "./ReadingIcons.js";
import { useDisclosure } from "./ReadingState.js";

/** A display fold. All content/actions inside still belong to an individual occurrence. */
export function ErrorRun({
  items,
  render,
}: {
  items: ActivityItem[];
  render: (item: ActivityItem) => ReactNode;
}) {
  const first = items[0]!;
  const [open, setOpen] = useDisclosure(`errors/${first.key}`);
  const [limit, setLimit] = useState(16);
  if (items.length === 1) return render(first);
  const model = first.kind === "replyIssue";
  let label: string | undefined;
  if (model) label = modelLabel(first.issue);
  else if (first.kind === "tool") label = first.tool.diagnostic?.label;
  return (
    <details
      className="error-run"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <ReadingIcon name="chevron" />
        <strong>{model ? "模型错误" : "工具错误"}</strong>
        <span className="error-run-label">{label}</span>
        <span className="error-run-count" title={`出现 ${items.length} 次`}>
          ×{items.length}
        </span>
      </summary>
      {open && (
        <>
          <ol aria-label="逐次错误记录">
            {items.slice(0, limit).map((item) => (
              <li key={item.key}>{render(item)}</li>
            ))}
          </ol>
          {items.length > limit && (
            <Button
              variant="ghost"
              label={`显示更多错误（剩余 ${items.length - limit} 次）`}
              onClick={() => setLimit((n) => n + 16)}
            />
          )}
        </>
      )}
    </details>
  );
}
