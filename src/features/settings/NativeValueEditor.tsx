import { nativeText, nativeValueType } from "./nativeFieldValues.js";
import { nativeSummary, type NativeRow } from "./nativeRows.js";
import type { NativeValueType } from "./modelFields.js";

export const initialText: Record<NativeValueType, string> = {
  text: "",
  number: "0",
  boolean: "false",
  null: "null",
  json: "[]",
};
const names = {
  text: "文本",
  number: "数值",
  boolean: "布尔",
  null: "null",
  json: "数组",
  group: "分组",
};
export type CreateType = NativeValueType | "group";
export interface CreationInput {
  name: string;
  type: CreateType;
}
export function NativeCreate({
  entry,
  change,
  add,
}: {
  entry: CreationInput;
  change(input: CreationInput): void;
  add(key: string, type: CreateType): void;
}) {
  const { name: key, type } = entry;
  return (
    <>
      <label className="field">
        参数键
        <input
          autoFocus
          data-native-input
          value={key}
          onChange={(e) => {
            change({ ...entry, name: e.target.value });
          }}
        />
      </label>
      <label className="field">
        参数类型
        <select
          aria-label="参数类型"
          value={type}
          onChange={(e) =>
            change({ ...entry, type: e.target.value as CreateType })
          }
        >
          {Object.entries(names).map(([t, label]) => (
            <option key={t} value={t}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!key.trim()}
        onClick={() => add(key, type)}
      >
        创建参数
      </button>
    </>
  );
}
export function NativeValueEditor({
  row,
  unchangedText,
  input,
  undo,
  remove,
}: {
  row: NativeRow;
  unchangedText?: string;
  input(t: NativeValueType, text: string): void;
  undo(): void;
  remove(): void;
}) {
  const { path, value, original, change } = row,
    type = change?.nativeType ?? nativeValueType(value),
    text = change?.text ?? unchangedText ?? nativeText(value),
    removed = !!change && change.value === undefined && !change.error;
  const imageLimit =
    path.length === 3 && path[0] === "inputLimits" && path[1] === "images";
  const description = !imageLimit
    ? null
    : path[2] === "maxPerMessage"
      ? "每条消息的图片上限"
      : path[2] === "maxPerRequest"
        ? "每次请求的图片上限"
        : null;
  return (
    <>
      <h4>{path.at(-1)}</h4>
      {description && <p>{description}</p>}
      {removed ? (
        <p>保存后移除此参数。</p>
      ) : (
        <>
          <label className="field">
            {names[type]}
            {type === "boolean" ? (
              <select
                autoFocus
                data-native-input
                aria-label="本层值"
                value={text}
                onChange={(e) => input(type, e.target.value)}
              >
                <option>false</option>
                <option>true</option>
              </select>
            ) : type === "null" ? (
              <output>null</output>
            ) : type === "json" || type === "text" ? (
              <textarea
                autoFocus
                data-native-input
                aria-label="本层值"
                aria-invalid={!!change?.error}
                rows={type === "json" ? 4 : 2}
                value={text}
                onChange={(e) => input(type, e.target.value)}
              />
            ) : (
              <input
                autoFocus
                data-native-input
                aria-label="本层值"
                inputMode="decimal"
                aria-invalid={!!change?.error}
                value={text}
                onChange={(e) => input(type, e.target.value)}
              />
            )}
          </label>
          <details>
            <summary>更改值类型</summary>
            <label className="field">
              值类型
              <select
                aria-label="值类型"
                value={type}
                onChange={(e) => {
                  const t = e.target.value as NativeValueType;
                  input(
                    t,
                    original !== undefined && t === nativeValueType(original)
                      ? nativeText(original)
                      : initialText[t],
                  );
                }}
              >
                {Object.entries(names)
                  .filter(([t]) => t !== "group")
                  .map(([t, label]) => (
                    <option key={t} value={t}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          </details>
        </>
      )}
      {change?.error && (
        <p className="error-text" role="alert">
          {change.error}
        </p>
      )}
      {change && (
        <div className="native-original">
          <p>
            原值：
            {Array.isArray(original)
              ? nativeText(original)
              : nativeSummary(original)}
          </p>
          <button type="button" onClick={undo}>
            撤销此项修改
          </button>
        </div>
      )}
      {original !== undefined && !removed && (
        <button type="button" onClick={remove}>
          移除参数
        </button>
      )}
    </>
  );
}
