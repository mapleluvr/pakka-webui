import { type RefObject, useLayoutEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@astryxdesign/core/DropdownMenu";
import { CheckIndicator } from "@astryxdesign/core/Indicator";
import type { PocketThinkingLevel } from "@pakka/client/pocket";

export function ThinkingPicker({
  levels,
  current,
  disabled,
  open,
  onOpenChange,
  onChoose,
  signal,
  owner,
}: {
  levels: readonly PocketThinkingLevel[];
  current: PocketThinkingLevel | undefined;
  disabled: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  onChoose(level: PocketThinkingLevel): void;
  signal: AbortSignal;
  owner: RefObject<HTMLElement | null>;
}) {
  const label = levels.length ? (current ?? "默认") : "不支持";
  const unavailable = disabled || !levels.length;

  useLayoutEffect(() => {
    if (!open) return;
    // The workspace can hide a conversation without unmounting its composer.
    const composer = owner.current;
    const dismissIfHidden = () => {
      if (
        signal.aborted ||
        document.hidden ||
        !composer?.getClientRects().length
      )
        onOpenChange(false);
    };
    const observer = new ResizeObserver(dismissIfHidden);
    if (composer) observer.observe(composer);
    document.addEventListener("visibilitychange", dismissIfHidden);
    signal.addEventListener("abort", dismissIfHidden);
    dismissIfHidden();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", dismissIfHidden);
      signal.removeEventListener("abort", dismissIfHidden);
    };
  }, [open, onOpenChange, owner, signal]);

  return (
    <DropdownMenu
      presentation="popover"
      placement="above"
      alignment="end"
      menuWidth={216}
      isMenuOpen={open}
      onOpenChange={(next) => {
        if (!next || !unavailable) onOpenChange(next);
      }}
      renderTrigger={(props) => (
        <button
          {...props}
          type="button"
          className="toolbar-choice thinking-control"
          aria-disabled={unavailable}
          aria-label={`Thinking · ${label}`}
          title={`Thinking · ${label}`}
        >
          {label}
        </button>
      )}
    >
      <DropdownMenuGroup
        title={current == null ? "Thinking · 模型默认" : "Thinking"}
      >
        {levels.map((level) => (
          <DropdownMenuItem
            key={level}
            className="thinking-level-option"
            label={level}
            aria-current={current === level || undefined}
            endContent={current === level && <CheckIndicator state="checked" />}
            isDisabled={unavailable}
            hasCloseOnSelect={false}
            onClick={() => onChoose(level)}
          />
        ))}
      </DropdownMenuGroup>
    </DropdownMenu>
  );
}
