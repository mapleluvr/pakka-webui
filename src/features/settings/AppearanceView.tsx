import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import {
  changeAppearance,
  defaultAppearance,
  textSizes,
  useAppearance,
} from "./appearance.js";
import "./appearance.css";

export function AppearanceView() {
  const { preferences, saved } = useAppearance();
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
      <div className="surface form-grid">
        <Selector
          label="明暗模式"
          presentation="adaptive"
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
        aria-label="阅读预览"
      >
        <h2>阅读预览</h2>
        <p>一段清楚、从容的文字。Read comfortably at your own pace.</p>
        <p className="muted">说明文字 · 0123456789</p>
        <pre>
          <code>const message = "代码始终使用等宽字体";</code>
        </pre>
        <div className="actions">
          <Button label="示例按钮" variant="ghost" />
        </div>
      </section>
      <div>
        <Button
          label="恢复默认外观"
          variant="ghost"
          onClick={() => changeAppearance(defaultAppearance)}
        />
      </div>
    </section>
  );
}
