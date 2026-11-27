import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { defineUiPlugin, type UiViewProps } from "@pakka/webui-sdk";
import { useUiContext } from "@pakka/webui-sdk/react";

function Playground({ ui }: UiViewProps) {
  const shared = useUiContext();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  if (shared !== ui)
    throw new Error("UI context does not belong to this instance");
  return (
    <section className="flow">
      <p className="eyebrow">UI Playground</p>
      <h1>组件实验室</h1>
      <p className="muted">
        在独立页面里试用组件与浮层。这里的操作只影响当前界面。
      </p>
      <div className="surface flow">
        <h2>每个实例都有自己的状态</h2>
        <div className="actions">
          <Button
            label={`计数 ${count}`}
            onClick={() => setCount((value) => value + 1)}
          />
          <Button label="打开对话框" onClick={() => setOpen(true)} />
          <Button
            label="新建实例"
            onClick={() => {
              void ui.open({ plugin: "playground", view: "home" });
            }}
          />
        </div>
        <label className="field">
          临时草稿
          <textarea placeholder="试着输入，再打开另一个实例" rows={4} />
        </label>
      </div>
      <div className="surface flow">
        <h2>操作反馈</h2>
        <p className="muted">
          试着重复点击同一示例，或切换到窄屏查看最新一条。
        </p>
        <div className="actions">
          <Button
            label="成功示例"
            onClick={() =>
              ui.notice({ tone: "success", message: "组件已响应" })
            }
          />
          <Button
            label="信息示例"
            onClick={() =>
              ui.notice({
                tone: "info",
                message: "实验室的草稿只保留在当前页面",
              })
            }
          />
          <Button
            label="警告示例"
            onClick={() =>
              ui.notice({
                tone: "warning",
                message: "关闭这个实验室页面后，临时草稿和计数不会保留",
              })
            }
          />
        </div>
      </div>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        aria-label="组件实验室对话框"
      >
        <div className="flow dialog-content">
          <h2>当前界面的对话框</h2>
          <p>可以使用 Escape 关闭并返回触发按钮。</p>
          <Button
            label="显示提示"
            onClick={() =>
              ui.notice({ tone: "success", message: "当前实例已响应。" })
            }
          />
          <Button label="关闭对话框" onClick={() => setOpen(false)} />
        </div>
      </Dialog>
    </section>
  );
}
export const playground = defineUiPlugin({
  api: 1,
  runtime: "react19-astryx0.7.15",
  id: "playground",
  version: "0.1.0",
  title: "组件实验室",
  views: [
    {
      id: "home",
      title: "组件实验室",
      placement: "page",
      navigation: true,
      render: Playground,
    },
  ],
});
