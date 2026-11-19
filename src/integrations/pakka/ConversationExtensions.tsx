import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { AgentRef } from "@pakka/protocol/pocket";
import type { UiContext } from "@pakka/webui-sdk";
import { conversationResource } from "./resources.js";
import type { attachPakkaExtensions } from "./extensions.js";

type Attachments = ReturnType<typeof attachPakkaExtensions>;
type Contribution = ReturnType<Attachments["views"]>[number];

/** Generic target-specific contributions; each module supplies its own domain UI. */
export function ConversationExtensions({
  ui,
  target,
  extensions,
}: {
  ui: UiContext;
  target: AgentRef;
  extensions: Attachments;
}) {
  const [views, setViews] = useState<readonly Contribution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const attached = useRef<Attachments | null>(null);
  const identity = JSON.stringify(target);
  useEffect(() => {
    const lifetime = new AbortController();
    const signal = AbortSignal.any([lifetime.signal, ui.signal]);
    let current: Attachments;
    const changed = () => {
      if (!signal.aborted) setViews(current.views());
    };
    current = extensions.forConversation({
      target,
      signal,
      instanceId: ui.instanceId,
      changed,
    });
    attached.current = current;
    setViews([]);
    setError(null);
    void current
      .refresh()
      .then(changed)
      .catch(() => {
        if (!signal.aborted) {
          setViews([]);
          setError("当前 Conversation 的插件未能读取。");
        }
      });
    return () => {
      lifetime.abort();
      if (attached.current === current) attached.current = null;
      try {
        current.dispose();
      } catch {
        /* Registry reports and retains the cleanup failure. */
      }
    };
  }, [extensions, ui, identity]);
  if (!views.length && !error) return null;
  return (
    <section className="flow compact" aria-label="Conversation 插件">
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        {views.map((view) => (
          <Button
            key={`${view.plugin}/${view.view}`}
            label={view.title}
            variant="ghost"
            onClick={() => {
              void ui
                .open(
                  {
                    plugin: view.plugin,
                    view: view.view,
                    resource: conversationResource(target),
                  },
                  view.placement,
                )
                .catch(() => {
                  if (!ui.signal.aborted)
                    setError("插件界面暂不可用，请刷新插件后再打开。");
                });
            }}
          />
        ))}
        {error && (
          <Button
            label="重读 Conversation 插件"
            onClick={() => {
              void attached.current
                ?.refresh()
                .then(() => {
                  if (!ui.signal.aborted) setError(null);
                })
                .catch(() => {});
            }}
          />
        )}
      </div>
    </section>
  );
}
