import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import type {
  PocketPersonalNavigation,
  PocketNavigationAction,
} from "@pakka/protocol/pocket";
import type { Editor } from "./WorkspaceEditor.js";
export function PersonalOrganization({
  navigation,
  blocked,
  folder,
  setFolder,
  personal,
  setEditor,
}: {
  navigation: PocketPersonalNavigation;
  blocked: boolean;
  folder: string;
  setFolder(value: string): void;
  personal(action: PocketNavigationAction): Promise<void>;
  setEditor(value: Editor): void;
}) {
  return (
    <details className="surface">
      <summary>个人组织</summary>
      <div className="flow">
        <Selector
          label="排序方式"
          value={navigation.mode}
          options={[
            { value: "default", label: "按名称" },
            { value: "session", label: "按 Session 与名称" },
          ]}
          onChange={(mode) => {
            void personal({
              kind: "mode",
              mode: mode as "default" | "session",
            });
          }}
          isDisabled={blocked}
          presentation="adaptive"
          controlClassName="touch-control"
        />
        <Selector
          label="文件夹"
          value={folder}
          options={[
            { value: "*", label: "全部" },
            { value: "", label: "未分类" },
            ...navigation.folders.map((row) => ({
              value: row.id,
              label: row.name,
            })),
          ]}
          onChange={setFolder}
          presentation="adaptive"
          controlClassName="touch-control"
        />
        <Button
          label="新建个人文件夹"
          variant="ghost"
          isDisabled={blocked}
          onClick={() => setEditor({ kind: "folder", name: "" })}
        />
        <ul className="resource-list">
          {navigation.folders.map((row) => (
            <li key={row.id} className="actions">
              <strong>{row.name}</strong>
              <Button
                label={`重命名文件夹 ${row.name}`}
                variant="ghost"
                isDisabled={blocked}
                onClick={() =>
                  setEditor({ kind: "folder", id: row.id, name: row.name })
                }
              />
              <Button
                label={`删除文件夹 ${row.name}`}
                variant="ghost"
                isDisabled={blocked}
                onClick={() =>
                  setEditor({
                    kind: "folder-delete",
                    id: row.id,
                    name: row.name,
                  })
                }
              />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
