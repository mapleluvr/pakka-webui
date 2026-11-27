import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import {
  errorRuns,
  type ActivityGroup,
  type ActivityItem,
} from "./transcript.js";
import { ErrorRun } from "./ErrorRun.js";
import { ReplyIssueCard } from "./ReplyIssueCard.js";
import { Thinking, ToolCard } from "./ToolCard.js";
import type { ContentBindings } from "./TextContent.js";
import { MoreIcon } from "./ReadingIcons.js";
import { useDisclosure } from "./ReadingState.js";

export function ActivityStrip({
  group,
  onFork,
  filtering,
  ...bindings
}: ContentBindings & {
  group: ActivityGroup;
  onFork?(entryId: string): void;
  filtering: boolean;
}) {
  const [open, setOpen] = useDisclosure(group.key);
  const [limit, setLimit] = useState(16);
  function menu(entryId?: string) {
    if (!entryId || !onFork) return;
    return (
      <MoreMenu
        label="消息操作"
        icon={<MoreIcon />}
        alignment="end"
        items={[
          {
            label: "从这里分叉",
            onClick: () => onFork(entryId),
          },
        ]}
      />
    );
  }
  function render(item: ActivityItem) {
    if (item.kind === "replyIssue")
      return (
        <ReplyIssueCard
          issue={item.issue}
          identity={item.key}
          actions={menu(item.entryId)}
          {...bindings}
        />
      );
    return (
      <div className="activity-leaf">
        {item.kind === "tool" ? (
          <ToolCard
            tool={item.tool}
            identity={item.key}
            source={item.source}
            {...bindings}
          />
        ) : (
          <Thinking part={item.part} identity={item.key} {...bindings} />
        )}
        {menu(item.entryId)}
      </div>
    );
  }
  const runs = open ? errorRuns(group.items) : [];
  if (!group.items.length)
    return (
      <div className="activity-strip activity-indicator" data-running>
        <span className="activity-mark" aria-hidden="true" />
        {group.label}
      </div>
    );
  return (
    <details
      className="activity-strip"
      data-running={group.running || undefined}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <span className="activity-mark" aria-hidden="true" />
        <span>{group.label}</span>
        {group.attention && (
          <strong className="activity-attention">Needs attention!</strong>
        )}
        {filtering && (
          <small> · 匹配 {group.matchCount ?? group.items.length} 项</small>
        )}
      </summary>
      {open && (
        <div className="activity-tree">
          {runs.slice(0, limit).map((items) => (
            <ErrorRun key={items[0]!.key} items={items} render={render} />
          ))}
          {runs.length > limit && (
            <Button
              variant="ghost"
              label={`显示更多活动（剩余 ${runs.length - limit} 项）`}
              onClick={() => setLimit((n) => n + 16)}
            />
          )}
        </div>
      )}
    </details>
  );
}
