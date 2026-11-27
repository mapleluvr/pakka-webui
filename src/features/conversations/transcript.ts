import type {
  PocketDisplay,
  PocketMessage,
  PocketPart,
  PocketSnapshot,
} from "@pakka/protocol/pocket";
import type { ConversationReference } from "@pakka/protocol/webui";

type Call = Extract<PocketPart, { type: "toolCall" }>;
export type ToolContent = {
  callId: string;
  name: string;
  declaration?: Call;
  result?: PocketMessage;
  errorOrder?: number;
  diagnostic?: { label: string; fingerprint?: Fingerprint };
  live?: PocketSnapshot["live"]["tools"][number];
};
type Origin = {
  key: string;
  source: string;
  entryId?: string;
  taskId?: string;
  isLive?: boolean;
};
export type { ReplyIssue } from "./reply-diagnostics.js";
import {
  modelLabel,
  replyIssue,
  similar,
  toolDiagnostic,
  type Fingerprint,
  type ReplyIssue,
} from "./reply-diagnostics.js";
export type IssueItem = Origin & {
  kind: "replyIssue";
  issue: ReplyIssue;
  order: number;
};
type IssueRow = IssueItem & { occurrences: IssueItem[] };
type Body = Origin &
  (
    | { kind: "message"; message: PocketMessage }
    | { kind: "display"; display: PocketDisplay }
  );
export type Activity = Origin &
  (
    | { kind: "tool"; tool: ToolContent }
    | { kind: "thought"; part: Extract<PocketPart, { type: "thinking" }> }
  );
export type ActivityGroup = Origin & {
  kind: "activity";
  items: ActivityItem[];
  attention?: boolean;
  matchCount?: number;
  label: string;
  running: boolean;
  failures: number;
  total: number;
};
export type ActivityItem = Activity | IssueItem;
export type TranscriptRow = Body | IssueRow | ActivityGroup;

export function readableThought(
  part: Extract<PocketPart, { type: "thinking" }>,
) {
  if (part.thinking.trim()) return true;
  const ref = part.contentReference;
  return (
    ref?.source === "entry" &&
    ref.encoding === "text" &&
    !ref.previewComplete &&
    ref.byteLength > 0
  );
}

export function transcriptRows(
  entries: PocketSnapshot["entries"],
  live: PocketSnapshot["live"] | undefined,
  reference: ConversationReference,
): TranscriptRow[] {
  let liveThinking = false;
  let order = 0;
  const leaves: (Body | ActivityItem)[] = [],
    tools = new Map<string, Extract<Activity, { kind: "tool" }>>();
  function tool(origin: Origin, callId: string, name: string) {
    const key = JSON.stringify([reference.sessionId, origin.source, callId]);
    let row = tools.get(key);
    if (!row) {
      row = { ...origin, key, kind: "tool", tool: { callId, name } };
      tools.set(key, row);
      leaves.push(row);
    } else if (!row.entryId && origin.entryId) row.entryId = origin.entryId;
    return row.tool;
  }
  function message(m: PocketMessage, origin: Origin) {
    if (m.role === "toolResult" && m.toolCallId) {
      const content = tool(origin, m.toolCallId, m.toolName ?? "工具");
      content.result = m;
      if (m.isError) {
        content.errorOrder = ++order;
        content.diagnostic = toolDiagnostic(content);
      }
      return;
    }
    if (m.role !== "assistant") {
      if (m.content.length)
        leaves.push({ ...origin, kind: "message", message: m });
      return;
    }
    const issue = replyIssue(m);
    const finish = () => {
      if (!issue) return;
      if (origin.isLive) liveThinking = false;
      leaves.push({
        ...origin,
        key: `${origin.key}/error`,
        kind: "replyIssue",
        order: ++order,
        issue,
      });
    };
    if (typeof m.content === "string") {
      if (m.content.length || m.contentReference?.byteLength)
        leaves.push({
          ...origin,
          kind: "message",
          message: { ...m, errorMessage: undefined, errorReference: undefined },
        });
      finish();
      return;
    }
    // Preserve even intra-message boundaries between Commentary, activity and final text.
    let parts: PocketPart[] = [],
      first = 0;
    const flush = () => {
      if (parts.length)
        leaves.push({
          ...origin,
          key: `${origin.key}/${first}`,
          kind: "message",
          message: {
            ...m,
            content: parts,
            errorMessage: undefined,
            errorReference: undefined,
          },
        });
      parts = [];
    };
    for (const [index, part] of m.content.entries()) {
      if (part.type === "text" && !part.text.trim() && !part.contentReference)
        continue;
      if (origin.isLive) liveThinking = part.type === "thinking";
      if (part.type === "thinking" && !readableThought(part)) continue;
      if (part.type === "text" || part.type === "image") {
        if (!parts.length) first = index;
        parts.push(part);
        continue;
      }
      flush();
      if (part.type === "toolCall")
        tool(origin, part.id, part.name).declaration = part;
      else
        leaves.push({
          ...origin,
          key: `${origin.key}/thought/${index}`,
          kind: "thought",
          part,
        });
    }
    flush();
    finish();
  }
  for (const entry of entries) {
    const origin = {
      source: entry.sourceConversationId ?? entry.conversationId,
      entryId: entry.id,
      taskId: entry.taskId,
    };
    for (const [i, m] of entry.messages.entries()) {
      message(m, { ...origin, key: `entry/${entry.id}/${i}` });
    }
    if (entry.display)
      leaves.push({
        ...origin,
        key: `display/${entry.id}`,
        kind: "display",
        display: entry.display,
      });
  }
  const liveOrigin = {
    source: reference.conversationId,
    isLive: true,
    key: `live/${entries.at(-1)?.id ?? "start"}`,
  };
  if (live?.message) message(live.message, liveOrigin);
  for (const t of live?.tools ?? [])
    tool({ ...liveOrigin, taskId: t.taskId }, t.callId, t.name).live = t;
  return groupActivities(leaves, !!live?.busy, liveThinking, liveOrigin);
}
// Similarity only affects adjacent presentation. Each occurrence keeps its own
// toolCallId or source entry and its own original-content authorization path.
function fingerprint(item: ActivityItem) {
  if (item.kind === "tool") return item.tool.diagnostic?.fingerprint;
  if (item.kind === "replyIssue" && !item.issue.stopped)
    return item.issue.fingerprint;
}
export function errorRuns(items: ActivityItem[]) {
  const runs: ActivityItem[][] = [];
  for (const item of items) {
    const previous = runs.at(-1);
    if (previous && similar(fingerprint(previous[0]!), fingerprint(item)))
      previous.push(item);
    else runs.push([item]);
  }
  return runs;
}
function groupActivities(
  leaves: (Body | ActivityItem)[],
  busy: boolean,
  liveThinking: boolean,
  liveOrigin: Origin,
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  for (const leaf of leaves) {
    const tail = rows.at(-1);
    if (leaf.kind === "message" || leaf.kind === "display") {
      rows.push(leaf);
      continue;
    }
    const same = tail?.source === leaf.source;
    const last = tail?.kind === "activity" ? tail.items.at(-1) : undefined;
    const stopped = last?.kind === "replyIssue" && last.issue.stopped;
    // The tool execution and next inference have distinct task IDs. A repeated
    // failed call can therefore continue a visible series across those IDs.
    if (
      same &&
      tail?.kind === "activity" &&
      !stopped &&
      (leaf.kind === "replyIssue" ||
        !tail.taskId ||
        !leaf.taskId ||
        tail.taskId === leaf.taskId ||
        (last && similar(fingerprint(last), fingerprint(leaf))))
    ) {
      tail.items.push(leaf);
      tail.taskId ??= leaf.taskId;
    } else if (leaf.kind === "replyIssue") {
      if (
        same &&
        tail?.kind === "replyIssue" &&
        similar(fingerprint(tail), fingerprint(leaf))
      ) {
        tail.occurrences.push(leaf);
      } else rows.push({ ...leaf, occurrences: [leaf] });
    } else rows.push(activityGroup(leaf, [leaf]));
  }
  const tail = rows.at(-1);
  if (
    busy &&
    liveThinking &&
    (tail?.kind !== "activity" || tail.source !== liveOrigin.source)
  ) {
    rows.push(
      activityGroup({ ...liveOrigin, key: `${liveOrigin.key}/thinking` }, []),
    );
  }
  for (const row of rows)
    if (row.kind === "activity")
      summarize(
        row,
        busy && row === rows.at(-1) && row.source === liveOrigin.source,
        liveThinking,
      );
  return rows;
}
function activityGroup(origin: Origin, items: ActivityItem[]): ActivityGroup {
  return {
    ...origin,
    kind: "activity",
    key: `activity/${origin.key}`,
    items,
    label: "",
    running: false,
    failures: 0,
    total: 0,
  };
}
function activeAction(
  calls: Extract<Activity, { kind: "tool" }>[],
  liveThinking: boolean,
) {
  let action: string;
  const running = calls.filter(
    (x) => !x.tool.result && x.tool.live?.status === "running",
  );
  if (running.length)
    action = running
      .map((x) => x.tool.name)
      .filter((x, i, a) => a.indexOf(x) === i)
      .join(" + ");
  else if (liveThinking) action = "thinking";
  else if (
    calls.some((x) => !x.tool.result && x.tool.live?.status === "pending")
  )
    action = "waiting for tool";
  else action = "waiting for update";
  return action;
}
function summarize(row: ActivityGroup, active: boolean, liveThinking: boolean) {
  const calls = row.items.filter((x) => x.kind === "tool");
  const thoughts = row.items.filter((x) => x.kind === "thought").length;
  const modelErrors = row.items.filter(
    (x) => x.kind === "replyIssue" && !x.issue.stopped,
  ).length;
  const toolErrors = calls.filter((x) => x.tool.result?.isError).length;
  const last = row.items.at(-1);
  const terminal = last?.kind === "replyIssue" ? last.issue : undefined;
  row.running = active && !terminal?.stopped;
  row.attention = toolErrors + modelErrors > 0;
  row.failures = toolErrors;
  row.total = row.items.length;
  let phase = "Done";
  if (row.running) phase = "Running";
  else if (terminal?.stopped) phase = "Stopped";
  else if (terminal) phase = "Failed";
  const counts: string[] = [];
  for (const [n, label] of [
    [calls.length, "tool call"],
    [thoughts, "thought"],
    [toolErrors, "tool error"],
    [modelErrors, "model error"],
  ] as const)
    if (n) counts.push(`${n} ${label}${n === 1 ? "" : "s"}`);
  if (row.running)
    counts.push(latestError(row.items) ?? activeAction(calls, liveThinking));
  row.label = `${phase} (${counts.join(", ")})`;
}
function latestError(items: ActivityItem[]) {
  // Result order (parallel tools may finish in reverse), never declaration order.
  const events = items
    .flatMap((x): { order: number; label: string; fp?: Fingerprint }[] => {
      if (x.kind === "replyIssue" && !x.issue.stopped)
        return [
          { order: x.order, label: modelLabel(x.issue), fp: fingerprint(x) },
        ];
      if (x.kind === "tool" && x.tool.diagnostic)
        return [
          {
            order: x.tool.errorOrder!,
            label: x.tool.diagnostic.label,
            fp: fingerprint(x),
          },
        ];
      return [];
    })
    .sort((a, b) => a.order - b.order);
  let first = events[0],
    count = 0;
  for (const event of events) {
    if (!similar(first?.fp, event.fp)) {
      first = event;
      count = 0;
    }
    count++;
  }
  const latest = events.at(-1);
  if (!latest) return;
  return count > 1 ? `${latest.label} ×${count}` : latest.label;
}
function messageText(message: PocketMessage) {
  return [
    message.errorMessage ?? "",
    typeof message.content === "string"
      ? message.content
      : message.content
          .map((part) => {
            switch (part.type) {
              case "text":
                return part.text;
              case "thinking":
                return part.thinking;
              case "image":
                return part.mimeType;
              case "toolCall":
                return JSON.stringify(part.arguments);
              default:
                return "";
            }
          })
          .join("\n"),
  ].join("\n");
}
function preview(row: Body | ActivityItem): string {
  if (row.kind === "replyIssue") {
    const { title, reason, http, hint, detail } = row.issue;
    return [title, reason, http && `HTTP ${http}`, hint, detail]
      .filter(Boolean)
      .join("\n");
  }
  if (row.kind === "thought") return row.part.thinking;
  if (row.kind === "display") return row.display.text;
  if (row.kind === "message") return messageText(row.message);
  return [
    row.tool.name,
    row.tool.declaration ? JSON.stringify(row.tool.declaration.arguments) : "",
    row.tool.result ? messageText(row.tool.result) : "",
    row.tool.live?.output ?? "",
  ].join("\n");
}
export function matchRows(
  rows: TranscriptRow[],
  query: string,
): TranscriptRow[] {
  const needle = query.toLocaleLowerCase();
  if (!needle) return rows;
  const matches = (row: Body | ActivityItem) =>
    preview(row).toLocaleLowerCase().includes(needle);
  const out: TranscriptRow[] = [];
  for (const row of rows) {
    if (row.kind === "activity") {
      const items = row.items.filter(matches);
      const matchCount = items.length;
      if (matchCount) out.push({ ...row, items, matchCount });
      else if (
        `${row.label} ${row.attention ? "Needs attention!" : ""}`
          .toLocaleLowerCase()
          .includes(needle)
      )
        out.push({ ...row, matchCount: 1 });
    } else if (row.kind === "replyIssue") {
      const occurrences = row.occurrences.filter(matches);
      if (occurrences.length) out.push({ ...occurrences[0]!, occurrences });
    } else if (matches(row)) out.push(row);
  }
  return out;
}
