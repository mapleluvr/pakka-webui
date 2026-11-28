import assert from "node:assert/strict";
import { test } from "node:test";
import * as labels from "../src/features/conversations/input-labels.ts";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Exercise the same .js -> TypeScript resolution as the browser build, in memory.
const built = await build({
  entryPoints: [
    fileURLToPath(
      new URL("../src/features/conversations/transcript.ts", import.meta.url),
    ),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const { transcriptRows, matchRows, errorRuns } = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].contents).toString("base64")
);

const target = { sessionId: "s", conversationId: "c" };
const tool = (id) => ({ type: "toolCall", id, name: "read", arguments: {} });
const thought = (thinking) => ({ type: "thinking", thinking });
function summary(parts, busy = false) {
  const entries = [
    {
      id: "e",
      conversationId: "c",
      messages: [{ role: "assistant", content: parts }],
    },
  ];
  const tools = busy ? [{ callId: "a", name: "read", status: "running" }] : [];
  return transcriptRows(entries, { busy, tools }, target)[0]?.label;
}
test("activity summaries omit every zero count and preserve action and plurality", () => {
  assert.equal(summary([tool("a"), thought("")]), "Done (1 tool call)");
  assert.equal(summary([tool("a"), tool("b")]), "Done (2 tool calls)");
  assert.equal(summary([thought("x")]), "Done (1 thought)");
  assert.equal(
    summary([tool("a"), thought("x")]),
    "Done (1 tool call, 1 thought)",
  );
  assert.equal(summary([tool("a")], true), "Running (1 tool call, read)");
  assert.equal(summary([thought("")]), undefined);
});
test("only a placed receipt on a live busy view gets a processing indicator", () => {
  for (const state of [
    "queued",
    "unanswered",
    "unknown",
    "done",
    null,
    undefined,
  ]) {
    assert.notEqual(labels.inlineInputStatus(state, true), "processing");
  }
  assert.equal(labels.inlineInputStatus("placed", true), "processing");
  assert.equal(labels.inlineInputStatus("placed", false), "placed");
  assert.equal(labels.inlineInputStatus("done", true), undefined);
});
test("a receipt identifies one user entry of this person in this conversation", () => {
  const msg = { role: "user", content: "same text" };
  const entry = (id, extra = {}) => ({
    id,
    conversationId: "c",
    messages: [msg],
    ...extra,
  });
  const item = (entryId, extra = {}) => ({
    receipt: { entryId, target, actorId: "me", status: "placed", ...extra },
  });
  const entries = [
    entry("one"),
    entry("other"),
    entry("source", { sourceConversationId: "else" }),
    entry("ambiguous", { messages: [msg, msg] }),
    entry("dup"),
    entry("session"),
  ];
  const page = {
    items: [
      item("one"),
      item("other", { actorId: "other" }),
      item("source"),
      item("ambiguous"),
      item("dup"),
      item("dup"),
      item("session", { target: { ...target, sessionId: "else" } }),
      item(undefined),
    ],
  };
  const m = labels.ownEntryStatuses(entries, page, "me", target);
  assert.equal(m.get("one"), "placed");
  for (const id of ["other", "source", "ambiguous", "dup", "session"])
    assert.ok(!m.get(id));
});
const M = (errorMessage) => ({
  role: "assistant",
  content: [],
  stopReason: "error",
  errorMessage,
});
const t = (id) => ({
  role: "assistant",
  content: [{ type: "toolCall", id, name: "powershell", arguments: {} }],
});
const r = (id, s) => ({
  role: "toolResult",
  toolCallId: id,
  toolName: "powershell",
  isError: true,
  content: s,
});
const entry = (m, i) => ({ id: "" + i, conversationId: "c", messages: [m] });
const project = (ms, busy = false, live) =>
  transcriptRows(ms.map(entry), { busy, tools: [], message: live }, target);
const err = (id, status = 429, code = "rate_limit") =>
  M(
    "router API error (" +
      status +
      "): " +
      JSON.stringify({
        error: {
          code,
          message:
            "Request processing rate exceeded for this model [request_id=" +
            id +
            "]",
        },
      }),
  );
const ids = Array.from(
  { length: 8 },
  (_, i) => "fixtureTRACE" + i + "abcdefgh123",
);
const errors = ids.map((id) => err(id));
test("tool summary separates the counted error from the active diagnostic, latest by result arrival", () => {
  const ms = [
    t("a"),
    t("b"),
    r("b", "Error: second"),
    r("a", "Error: first finished last"),
  ];
  assert.equal(project(ms)[0].label, "Done (2 tool calls, 2 tool errors)");
  assert.match(project(ms, true)[0].label, /Error: first finished last\)$/);
});
test("model errors can arrive during work and repeat after tools; completed phase has counts only", () => {
  const ms = [t("a"), r("a", "fail"), ...errors];
  const [g, ...rest] = project(ms);
  assert.equal(rest.length, 0);
  assert.equal(g.label, "Failed (1 tool call, 1 tool error, 8 model errors)");
  assert.equal(g.attention, true);
  assert.match(project(ms, true)[0].label, /^Running .*429.*×8\)$/);
  assert.equal(matchRows([g], ids[5])[0].items.length, 1);
});
test("eight standalone records form one card; all original entries still searchable; replay does not count again", () => {
  for (let i = 0; i < 2; i++) {
    const [row, ...rest] = project(errors);
    assert.equal(rest.length, 0);
    assert.equal(row.kind, "replyIssue");
    assert.equal(row.occurrences.length, 8);
    for (const [i, id] of ids.entries()) {
      const [hit] = matchRows([row], id);
      assert.equal(hit.occurrences.length, 1);
      assert.equal(hit.occurrences[0].entryId, String(i));
      assert.match(hit.occurrences[0].issue.detail, new RegExp(id));
    }
  }
});
test("do not group across status, declared code, source, visible text, user input or tool family", () => {
  const base = errors[0];
  for (const next of [
    err(ids[1], 503),
    err(ids[1], 429, "quota_exhausted"),
    M("HTTP 429: Concurrent image jobs rejected"),
  ])
    assert.equal(project([base, next]).length, 2);
  for (const role of ["user", "assistant"])
    assert.equal(project([base, { role, content: "text" }, base]).length, 3);
  assert.equal(
    transcriptRows(
      [entry(base, 0), { ...entry(base, 1), sourceConversationId: "other" }],
      undefined,
      target,
    ).length,
    2,
  );
  assert.equal(
    project([r("a", base.errorMessage), base])[0].label,
    "Failed (1 tool call, 1 tool error, 1 model error)",
  );
});
test("each heuristic can identify a series without crossing families", () => {
  const cases = [
    [
      "provider socket closed before headers",
      "provider socket closed before headers during handshake",
    ],
    [
      "request limit regional capacity exhausted",
      "regional capacity request limit exhausted",
    ],
    [
      "regional concurrency limit temporarily exceeded",
      "regional concurrency limit temporarilly exceeded",
    ],
    [
      "trace_id=firstRequest33445566 limit reached",
      "trace_id=nextRequest44332233 limit reached",
    ],
  ];
  for (const [a, b] of cases)
    assert.equal(
      project([M("HTTP 429: " + a), M("HTTP 429: " + b)])[0].occurrences.length,
      2,
    );
  const [group] = project([
    r("a", "Error: note missing [request_id=f123]"),
    r("b", "Error: note missing [request_id=f456]"),
    { ...r("c", "Error: note missing [request_id=f789]"), toolName: "bash" },
  ]);
  assert.deepEqual(
    errorRuns(group.items).map((run) => run.length),
    [2, 1],
  );
});
test("unfamiliar network failures and unrelated status errors keep useful fallback and exact diagnostic", () => {
  for (const raw of [
    "socket hang up before response headers",
    "HTTP 418: teapot endpoint",
    'AgentRouter API error (400): {"message":"unknown model parameter"}',
  ]) {
    const [row] = project([M(raw)]);
    assert.equal(row.issue.detail, raw);
    assert.doesNotMatch(row.issue.reason, /另一个 OpenAI/);
  }
  assert.match(
    project([M("socket hang up before response headers")])[0].issue.reason,
    /socket hang up/,
  );
});
