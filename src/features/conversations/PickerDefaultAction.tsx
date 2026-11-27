import { Button } from "@astryxdesign/core/Button";
import type { ModelCatalogItem } from "@pakka/protocol/webui";
import {
  sameModel,
  type PersonalModelDefaults,
} from "../settings/usePersonalModelDefaults.js";
import { modelKey, modelIdentityKey } from "./modelCatalog.js";

export function PickerDefaultAction({
  personal,
  model,
  confirm,
  onChoose,
  onConfirm,
  onCancel,
  currentDisabled,
  choices,
  highlight,
  canSet,
}: {
  personal: PersonalModelDefaults;
  model?: ModelCatalogItem;
  confirm: boolean;
  onChoose(): void;
  onConfirm(): void;
  onCancel(): void;
  currentDisabled: boolean;
  choices: readonly ModelCatalogItem[];
  highlight(item: ModelCatalogItem): void;
  canSet: boolean;
}) {
  const { defaults, error, pending, busy, message } = personal,
    already = !!model && !!defaults && sameModel(model, defaults.model);
  return (
    <section
      className="picker-default flow compact"
      aria-label="我的新对话默认模型"
    >
      {currentDisabled && (
        <p className="muted">当前对话暂不能换模；个人默认单独保存。</p>
      )}
      {pending ? (
        <>
          <p role="status">
            {pending === "unreadable"
              ? "个人默认原请求不可读，请保留本地记录。"
              : `个人默认原请求 ${pending.requestId} 待核对。`}
          </p>
          <Button
            label="核对原默认请求"
            isDisabled={busy || pending === "unreadable"}
            onClick={() => void personal.lookup()}
          />
        </>
      ) : confirm && model && defaults ? (
        <>
          <p role="status">
            {modelKey(model)} 不支持你的个人 Thinking「{defaults.thinkingLevel}
            」。保存后，新对话将改用模型默认 Thinking。
          </p>
          <div className="actions">
            <Button
              label="确认改用模型默认并保存"
              isDisabled={busy}
              onClick={onConfirm}
            />
            <Button label="保留原默认" variant="ghost" onClick={onCancel} />
          </div>
        </>
      ) : (
        <>
          <div className="actions">
            {model && (
              <select
                className="picker-target"
                aria-label="默认操作的目标模型"
                value={modelIdentityKey(model)}
                onChange={(e) => {
                  const item = choices.find(
                    (m) => modelIdentityKey(m) === e.target.value,
                  );
                  if (item) highlight(item);
                }}
              >
                {choices.map((m) => (
                  <option key={modelIdentityKey(m)} value={modelIdentityKey(m)}>
                    {modelKey(m)}
                    {defaults && sameModel(m, defaults.model)
                      ? " · 我的默认"
                      : ""}
                  </option>
                ))}
              </select>
            )}
            <Button
              label="设为我的新对话默认模型"
              isDisabled={!model || busy || !defaults || already || !canSet}
              onClick={onChoose}
            />
          </div>
          <p className="muted">
            Ctrl+Enter（Mac：⌘+Enter），或长按模型后松手。点按或 Enter
            只切换当前对话。
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!defaults && !busy && !pending && (
        <Button
          label="重新读取个人默认"
          variant="ghost"
          onClick={() => void personal.read()}
        />
      )}
    </section>
  );
}
