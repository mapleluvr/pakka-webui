import { sourceActions, type SourceAction } from "./notebook/source-actions.js";
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
import { UiIcon } from "@pakka/webui-sdk/icons";
import { useDisclosure } from "./ReadingState.js";

export function ActivityStrip({
  group,
  onFork,
  onSource,
  filtering,
  ...bindings
}: ContentBindings & {
  group: ActivityGroup;
  onSource?: SourceAction;
  onFork?(entryId: string): void;
  filtering: boolean;
}) {
  const [open, setOpen] = useDisclosure(group.key, group.items);
  const [limit, setLimit] = useState(16);
  function menu(
    entryId?: string,
    sourceItems: ReturnType<typeof sourceActions> = [],
  ) {
    if ((!entryId || !onFork) && !sourceItems.length) return;
    return (
      <MoreMenu
        label="消息操作"
        icon={<UiIcon name="more" />}
        alignment="end"
        items={[
          ...sourceItems,
          ...(onFork && entryId
            ? [
                {
                  label: "从这里分叉",
                  onClick: () => onFork(entryId),
                },
              ]
            : []),
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
    return item.kind === "tool" ? (
      <ToolCard
        tool={item.tool}
        identity={item.key}
        source={item.source}
        actions={menu(
          item.entryId,
          sourceActions(item.tool.result, bindings.conversation, onSource),
        )}
        {...bindings}
      />
    ) : (
      <Thinking
        part={item.part}
        identity={item.key}
        actions={menu(item.entryId)}
        {...bindings}
      />
    );
  }
  const runs = open ? errorRuns(group.items) : [];
  const phaseIcon = {
    Running: "spinner",
    Done: "check",
    Failed: "error",
    Stopped: "stop",
  } as const;
  const mark = (
    <UiIcon name={phaseIcon[group.phase]} className="activity-mark" />
  );
  if (!group.items.length)
    return (
      <div
        className="activity-strip activity-indicator"
        data-running
        data-phase={group.phase}
      >
        {mark}
        {group.label}
      </div>
    );
  return (
    <details
      className="activity-strip"
      data-phase={group.phase}
      data-running={group.phase === "Running" || undefined}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <UiIcon name="chevron" className="activity-chevron" />
        {mark}
        <span>
          {group.label}
          {group.attention && (
            <strong className="activity-attention">Needs attention!</strong>
          )}
          {filtering && (
            <small> · 匹配 {group.matchCount ?? group.items.length} 项</small>
          )}
        </span>
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
