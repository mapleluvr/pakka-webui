import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Dialog } from "@astryxdesign/core/Dialog";
import {
  changeAppearance,
  defaultAppearance,
  palettes,
  textSizes,
  useAppearance,
} from "./appearance.js";
import "./appearance.css";

export function AppearanceView() {
  const { preferences, saved } = useAppearance();
  const [previewOpen, setPreviewOpen] = useState(false);
  const fixed =
    preferences.palette === "pine" || preferences.palette === "blue";
  return (
    <section className="flow">
      <header>
        <p className="eyebrow">Preferences</p>
        <h1>外观</h1>
      </header>
      <p className="muted" role="status">
        {saved
          ? "保存在当前浏览器，应用于这里的页面与插件。"
          : "浏览器存储不可用，当前更改只在此页生效。"}
      </p>
      <fieldset className="palette-picker">
        <legend>主题配色</legend>
        <div className="palette-options">
          {palettes.map((palette) => (
            <label className="palette-option" key={palette.id}>
              <input
                type="radio"
                name="appearance-palette"
                value={palette.id}
                checked={preferences.palette === palette.id}
                onChange={() =>
                  changeAppearance({ ...preferences, palette: palette.id })
                }
              />
              <span
                className="palette-swatch"
                data-palette={palette.id}
                aria-hidden="true"
              >
                <span>Aa</span>
                <span>Aa</span>
              </span>
              <span className="palette-name">{palette.name}</span>
              <span className="palette-description">{palette.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {fixed && (
        <p className="muted">
          此主题在浅色与深色模式下使用同一配色。切换其他主题后，会继续使用你的明暗偏好。
        </p>
      )}
      <div className="surface form-grid">
        <Selector
          label="明暗模式"
          presentation="adaptive"
          isDisabled={fixed}
          value={preferences.mode}
          options={[
            { value: "system", label: "跟随系统" },
            { value: "light", label: "浅色" },
            { value: "dark", label: "深色" },
          ]}
          onChange={(mode) => {
            if (mode === "system" || mode === "light" || mode === "dark")
              changeAppearance({ ...preferences, mode });
          }}
        />
        <Selector
          label="阅读字体"
          presentation="adaptive"
          value={preferences.font}
          options={[
            { value: "system", label: "系统字体" },
            { value: "serif", label: "衬线字体" },
            { value: "mono", label: "等宽字体" },
          ]}
          onChange={(font) => {
            if (font === "system" || font === "serif" || font === "mono")
              changeAppearance({ ...preferences, font });
          }}
        />
        <Selector
          label="文字大小"
          presentation="adaptive"
          value={String(preferences.size)}
          options={textSizes.map((size) => ({
            value: String(size),
            label: size + " px",
          }))}
          onChange={(value) => {
            const size = textSizes.find((size) => String(size) === value);
            if (size) changeAppearance({ ...preferences, size });
          }}
        />
      </div>
      <section
        className="surface flow appearance-preview"
        aria-label="外观预览"
      >
        <h2>外观预览</h2>
        <p>一段清楚、从容的文字。Read comfortably at your own pace.</p>
        <p className="muted">说明文字 · 0123456789</p>
        <label className="field">
          <span>输入框</span>
          <input placeholder="在这里试试输入与焦点效果" />
        </label>
        <pre>
          <code>const message = "代码始终使用等宽字体";</code>
        </pre>
        <div className="actions">
          <Button
            label="预览浮窗"
            variant="primary"
            onClick={() => setPreviewOpen(true)}
          />
          <Button label="次要按钮" variant="secondary" />
          <Button label="轻量按钮" variant="ghost" />
          <Button label="不可用" isDisabled />
        </div>
      </section>
      <div>
        <Button
          label="恢复默认外观"
          variant="ghost"
          onClick={() => changeAppearance(defaultAppearance)}
        />
      </div>
      <Dialog
        isOpen={previewOpen}
        onOpenChange={setPreviewOpen}
        aria-label="主题浮窗预览"
        width={440}
      >
        <section className="dialog-content flow">
          <h2>浮窗与阴影</h2>
          <p>浮窗、输入框和按钮使用当前主题的颜色。</p>
          <label className="field">
            <span>输入预览</span>
            <input placeholder="点一下查看焦点边框" />
          </label>
          <div className="actions">
            <Button
              label="完成预览"
              variant="primary"
              onClick={() => setPreviewOpen(false)}
            />
            <Button
              label="关闭"
              variant="secondary"
              onClick={() => setPreviewOpen(false)}
            />
          </div>
        </section>
      </Dialog>
    </section>
  );
}
