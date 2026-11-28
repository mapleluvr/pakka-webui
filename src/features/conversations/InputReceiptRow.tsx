import { useState } from "react";
import type { ConversationInputHistory } from "@pakka/protocol/webui";
import { inputModeLabel, inputStatus } from "./input-labels.js";

type InputItem = ConversationInputHistory["items"][number];
// The public receipt reason is an open string, not an enum. Only explain reported codes.
const reasons = new Map([
  ["model_error", "模型生成回复时出错。"],
  ["no_model", "没有可用的模型。"],
  ["aborted", "这条输入的处理已中止。"],
  ["blocked", "这条输入的处理受阻。"],
  ["reset", "运行已重置。"],
  ["stale", "这条输入已失效。"],
  ["faulted", "运行发生故障。"],
]);
export function InputReceiptRow({
  item,
  onWithdraw,
  disabled,
}: {
  item: InputItem;
  onWithdraw?: () => void;
  disabled: boolean;
}) {
  const { receipt, preview, truncated } = item;
  const [expanded, setExpanded] = useState(false);
  const excerpt = Array.from(preview.split("\n", 4).slice(0, 3).join("\n"))
    .slice(0, 100)
    .join("");
  const clipped = excerpt !== preview;
  return (
    <li className="input-receipt">
      <header>
        <span>{inputModeLabel[item.mode]}</span>
        <span className="input-status-pill" data-status={receipt.status}>
          {inputStatus[receipt.status]}
        </span>
      </header>
      <p className="input-preview">
        {expanded || !clipped ? preview : `${excerpt}…`}
      </p>
      {(clipped || truncated) && (
        <div className="input-preview-tools">
          {clipped && (
            <button
              className="reader-action"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "收起预览" : "展开预览"}
            </button>
          )}
          {truncated && <small>仅有截断预览</small>}
        </div>
      )}
      {receipt.reason && (
        <p className="input-reason">
          {reasons.get(receipt.reason) ?? receipt.reason}
        </p>
      )}
      {receipt.status === "unknown" && (
        <p className="input-reason">
          结果尚未确认。若发送区保有此原请求，可在那里查看发送状态，无需重发。
        </p>
      )}
      <div className="input-receipt-actions">
        <details className="panel-details">
          <summary>回执详情</summary>
          <dl>
            <dt>原请求</dt>
            <dd>{receipt.requestId}</dd>
            <dt>输入回执</dt>
            <dd>{receipt.id}</dd>
            {receipt.entryId && (
              <>
                <dt>消息 Entry</dt>
                <dd>{receipt.entryId}</dd>
              </>
            )}
            {receipt.reason && (
              <>
                <dt>原始原因</dt>
                <dd>{receipt.reason}</dd>
              </>
            )}
          </dl>
        </details>
        {onWithdraw && (
          <button
            type="button"
            className="reader-action"
            onClick={onWithdraw}
            disabled={disabled}
          >
            撤回此输入
          </button>
        )}
      </div>
    </li>
  );
}
