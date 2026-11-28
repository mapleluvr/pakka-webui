import { useId, useState } from "react";
import {
  compatFor,
  LEVELS,
  ProtocolField,
  usesSampling,
} from "./ProtocolField.js";
import {
  jsonValue,
  record,
  type FieldChange,
  type Json,
  type Path,
} from "./modelFields.js";

export interface ModelForm {
  regular(path: Path): boolean;
  value(path: Path): Json | undefined;
  change(path: Path): FieldChange | undefined;
  set(path: Path, value: Json | undefined, text?: string, error?: string): void;
  protected(path: Path): boolean;
}
export function TextField({
  form,
  path,
  label,
  numeric = false,
}: {
  form: ModelForm;
  path: Path;
  label: string;
  numeric?: boolean;
}) {
  const change = form.change(path),
    value = form.value(path),
    managed = form.protected(path);
  if (!form.regular(path)) return <small>{label}：见原生参数</small>;
  return (
    <label className="field">
      {label}
      <input
        aria-label={label}
        disabled={managed}
        value={change?.text ?? String(value ?? "")}
        placeholder={managed ? "由宿主管理" : "使用原生规则"}
        onChange={(e) => {
          const text = e.target.value,
            v = text.trim();
          if (!v) form.set(path, undefined, text);
          else if (!numeric) form.set(path, v, text);
          else if (Number.isFinite(Number(v)) && Number(v) >= 0)
            form.set(path, Number(v), text);
          else form.set(path, undefined, text, "请输入非负有限数值。");
        }}
      />
      {change?.error && <small role="alert">{change.error}</small>}
    </label>
  );
}
function Choice({
  label,
  value,
  choices,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  choices: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {choices.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function boolField(
  form: ModelForm,
  path: Path,
  label: string,
  yes = "开",
  no = "关",
) {
  const value = form.value(path);
  if (!form.regular(path))
    return <small key={label}>{label}：见原生参数</small>;
  return (
    <Choice
      key={label}
      label={label}
      value={value === undefined ? "" : String(value)}
      disabled={form.protected(path)}
      choices={[
        ["", "继承"],
        ["true", yes],
        ["false", no],
      ]}
      onChange={(v) => form.set(path, v === "" ? undefined : v === "true")}
    />
  );
}
export function Compatibility({
  form,
  api,
  provider,
  apis,
  setFilter,
}: {
  form: ModelForm;
  api: string;
  provider: boolean;
  setFilter(v: string): void;
  apis: string[];
}) {
  const protocol = api;
  const fields = compatFor(protocol),
    saved = record(form.value(["compat"]));
  const other = Object.keys(saved).filter((k) => !Object.hasOwn(fields, k));
  return (
    <details>
      <summary>{provider ? "提供商兼容性设置" : "模型兼容性设置"}</summary>
      <div className="flow compact">
        {provider && (
          <ProtocolField
            label="按协议查看"
            value={protocol}
            onChange={setFilter}
            apis={apis}
          />
        )}
        {Object.keys(fields).length === 0 && (
          <p>{protocol ? "此协议暂无可编辑的常用兼容项。" : "未指定协议。"}</p>
        )}
        <div className="form-grid">
          {Object.entries(fields).map(([key, options]) => {
            const path = ["compat", key],
              v = form.value(path);
            if (!form.regular(path))
              return <p key={key}>{key}：其他已配置值，见原生参数</p>;
            return options === true ? (
              boolField(form, path, key)
            ) : (
              <Choice
                key={key}
                label={key}
                value={String(v ?? "")}
                disabled={form.protected(path)}
                choices={[["", "继承"], ...options.map((s) => [s, s] as const)]}
                onChange={(v) => form.set(path, v || undefined)}
              />
            );
          })}
        </div>
        {!!other.length && (
          <p>其他已配置项：{other.join("、")}（原生参数可查看）</p>
        )}
      </div>
    </details>
  );
}
export function ModelParameters({
  form,
  api,
}: {
  form: ModelForm;
  api: string;
}) {
  const input = form.value(["input"]),
    reasoning = form.value(["reasoning"]);
  return (
    <>
      <div className="form-grid">
        <TextField
          form={form}
          path={["contextWindow"]}
          label="上下文窗口"
          numeric
        />
        <TextField
          form={form}
          path={["maxTokens"]}
          label="最大输出 token"
          numeric
        />
        <Choice
          label="输入能力"
          value={
            Array.isArray(input)
              ? input.includes("image")
                ? "image"
                : "text"
              : ""
          }
          disabled={!form.regular(["input"]) || form.protected(["input"])}
          choices={[
            ["", "继承"],
            ["text", "文本"],
            ["image", "文本与图片"],
          ]}
          onChange={(v) =>
            form.set(
              ["input"],
              v === "image"
                ? ["text", "image"]
                : v === "text"
                  ? ["text"]
                  : undefined,
            )
          }
        />
      </div>
      <details>
        <summary>Thinking Levels</summary>
        <div className="flow compact">
          {boolField(form, ["reasoning"], "支持 Thinking", "支持", "不支持")}
          {reasoning === false && (
            <p>已关闭 Thinking，映射保留但当前不生效。</p>
          )}
          <ThinkingLevelMap form={form} />
        </div>
      </details>
      <Sampling form={form} api={api} />
      <details>
        <summary>价格（USD / 百万 token）</summary>
        <div className="form-grid">
          {[
            ["input", "输入"],
            ["output", "输出"],
            ["cacheRead", "缓存读取"],
            ["cacheWrite", "缓存写入"],
          ].map(([k, label]) => (
            <TextField
              key={k}
              form={form}
              path={["cost", k!]}
              label={label!}
              numeric
            />
          ))}
        </div>
      </details>
    </>
  );
}
function ThinkingLevelMap({ form }: { form: ModelForm }) {
  const id = useId();
  return (
    <>
      <p className="muted">
        留空使用原生规则。取消禁用后恢复继承，也可直接输入新的请求值。
      </p>
      <table className="thinking-map" aria-label="Thinking 级别映射">
        <thead>
          <tr>
            <th scope="col">Pi 级别</th>
            <th scope="col" id={`${id}-value`}>
              提供商请求值
            </th>
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((level) => {
            const path = ["thinkingLevelMap", level],
              value = form.value(path),
              managed = form.protected(path),
              error = form.change(path)?.error;
            const row = `${id}-${level}`;
            if (!form.regular(path))
              return (
                <tr key={level}>
                  <th scope="row">{level}</th>
                  <td>见原生参数</td>
                </tr>
              );
            return (
              <tr key={level}>
                <th scope="row" id={row}>
                  {level}
                </th>
                <td>
                  <div className="thinking-controls">
                    <div className="field">
                      <input
                        type="text"
                        aria-labelledby={`${row} ${id}-value`}
                        aria-invalid={!!error}
                        aria-describedby={error ? `${row}-error` : undefined}
                        disabled={managed}
                        placeholder={
                          managed
                            ? "由宿主管理"
                            : value === null
                              ? "此级别已禁用"
                              : "使用原生规则"
                        }
                        value={typeof value === "string" ? value : ""}
                        onChange={(e) => {
                          const text = e.target.value;
                          form.set(
                            path,
                            text || undefined,
                            undefined,
                            text && !text.trim()
                              ? "请求值不能全为空白。"
                              : undefined,
                          );
                        }}
                      />
                      {error && (
                        <small role="alert" id={`${row}-error`}>
                          {error}
                        </small>
                      )}
                    </div>
                    <label className="thinking-disable">
                      <input
                        type="checkbox"
                        aria-label={`禁用 ${level} 级别`}
                        disabled={managed}
                        checked={value === null}
                        onChange={(e) =>
                          form.set(path, e.target.checked ? null : undefined)
                        }
                      />
                      禁用此级别
                    </label>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
function Sampling({ form, api }: { form: ModelForm; api: string }) {
  const [level, setLevel] = useState<string>("high");
  const by = record(form.value(["samplingParamsByThinkingLevel"]));
  return (
    <details>
      <summary>Sampling Params</summary>
      <div className="flow compact">
        <p className="muted">
          {usesSampling(api)
            ? "模型默认 → 有效 Thinking 级别 → 请求级，按键覆盖。"
            : "Pi 1.4.0 未在此协议合入这些请求参数。已有设置保留。"}
        </p>
        <SamplingRows form={form} path={["samplingParams"]} label="模型默认" />
        <details>
          <summary>按 Thinking 级别覆盖</summary>
          <Choice
            label="采样级别"
            value={level}
            choices={LEVELS.map((k) => [
              k,
              `${k}${Object.keys(record(by[k])).length ? " · 已设置" : ""}`,
            ])}
            onChange={setLevel}
          />
          <SamplingRows
            key={level}
            form={form}
            path={["samplingParamsByThinkingLevel", level]}
            label={`${level} 覆盖`}
          />
        </details>
      </div>
    </details>
  );
}
function SamplingRows({
  form,
  path,
  label,
}: {
  form: ModelForm;
  path: Path;
  label: string;
}) {
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    list = useId();
  const values = record(form.value(path));
  return (
    <section className="flow compact">
      <h4>{label}</h4>
      {Object.keys(values).map((key) => {
        const leaf = [...path, key],
          v = values[key],
          change = form.change(leaf),
          type =
            v === null ? "null" : typeof v === "object" ? "json" : typeof v;
        if (!form.regular(leaf)) return <p key={key}>{key} · 见原生参数</p>;
        if (form.protected(leaf)) return <p key={key}>{key} · 由宿主管理</p>;
        function update(type: string, text: string) {
          try {
            if (
              type === "number" &&
              (!text.trim() || !Number.isFinite(Number(text)))
            )
              throw Error("请输入有限数值，可为负数。");
            const next =
              type === "string"
                ? text
                : type === "number"
                  ? Number(text)
                  : type === "boolean"
                    ? text === "true"
                    : type === "null"
                      ? null
                      : jsonValue(text);
            if (type === "json" && (next === null || typeof next !== "object"))
              throw Error("请选择对应类型，或输入 JSON 对象或数组。");
            form.set(leaf, next, text);
          } catch (e) {
            form.set(leaf, v, text, e instanceof Error ? e.message : "无效值");
          }
        }
        return (
          <div className="sampling-row" key={key}>
            <strong>{key}</strong>
            <Choice
              label={`${key} 类型`}
              value={type}
              choices={[
                ["number", "数值"],
                ["boolean", "布尔"],
                ["string", "文本"],
                ["null", "null"],
                ["json", "JSON"],
              ]}
              onChange={(t) =>
                update(
                  t,
                  {
                    number: "0",
                    boolean: "false",
                    string: "",
                    null: "null",
                    json: "{}",
                  }[t] ?? "",
                )
              }
            />
            {type === "boolean" ? (
              <Choice
                label={`${key} 值`}
                value={String(v)}
                choices={[
                  ["true", "true"],
                  ["false", "false"],
                ]}
                onChange={(s) => update(type, s)}
              />
            ) : (
              type !== "null" && (
                <label className="field">
                  {key} 值
                  <input
                    value={
                      change?.text ??
                      (type === "json" ? JSON.stringify(v) : String(v))
                    }
                    onChange={(e) => update(type, e.target.value)}
                  />
                </label>
              )
            )}
            {change?.error && <small role="alert">{change.error}</small>}
            <button onClick={() => form.set(leaf, undefined)}>
              恢复 {key} 继承
            </button>
          </div>
        );
      })}
      <div className="actions">
        <label className="field">
          {label}参数键
          <input
            list={list}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="例如 temperature"
          />
        </label>
        <datalist id={list}>
          {[
            "temperature",
            "top_p",
            "frequency_penalty",
            "presence_penalty",
            "seed",
          ].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </datalist>
        <button
          disabled={!name.trim()}
          onClick={() => {
            const key = name.trim();
            if (Object.hasOwn(values, key)) {
              setError("此键已存在，请编辑原行。");
              return;
            }
            form.set([...path, key], 0);
            setName("");
          }}
        >
          添加{label}参数
        </button>
      </div>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}
