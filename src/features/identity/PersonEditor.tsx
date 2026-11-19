import { useId, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import type {
  PocketNavigation,
  PocketPerson,
  PocketRole,
} from "@pakka/protocol/pocket";
import type { PeopleAction, PeopleChange } from "@pakka/protocol/webui";
import { roleNames } from "./InvitationForm.js";

type PermissionAction = Extract<PeopleAction, { op: "person.set" }>;
export function PersonEditor({
  person,
  resources,
  pending,
  busy,
  error,
  save,
  lookup,
  close,
}: {
  person: PocketPerson;
  resources: readonly PocketNavigation[];
  pending: PeopleChange | "unreadable" | null;
  busy: boolean;
  error: string | null;
  save(action: PermissionAction): Promise<void>;
  lookup(): Promise<void>;
  close(): void;
}) {
  const formId = useId();
  const original =
    pending &&
    pending !== "unreadable" &&
    pending.action.op === "person.set" &&
    pending.action.personId === person.id
      ? pending.action
      : null;
  const [role, setRole] = useState<PocketRole>(original?.role ?? person.role);
  const initial = original?.resources ?? person.resources;
  const [all, setAll] = useState(initial === "*");
  const [selected, setSelected] = useState<readonly string[]>(
    initial === "*" ? [] : initial,
  );
  const blocked = busy || !!pending;
  const available = new Map<string, string>(
    resources.flatMap((row) =>
      row.resourceId
        ? [
            [
              row.resourceId,
              `${row.name} · ${row.ref.sessionId.slice(0, 8)} / ${row.ref.conversationId}`,
            ] as const,
          ]
        : [],
    ),
  );
  for (const id of selected)
    if (!available.has(id)) available.set(id, `${id}（当前未加载的原授权）`);
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
      aria-label={`修改 ${person.name} 的权限`}
    >
      <Layout
        header={
          <LayoutHeader>
            <h1>修改成员权限</h1>
            <p>{person.name}</p>
          </LayoutHeader>
        }
        content={
          <LayoutContent label="成员权限">
            <form
              id={formId}
              className="flow"
              onSubmit={(event) => {
                event.preventDefault();
                if (!blocked && (all || selected.length))
                  void save({
                    op: "person.set",
                    personId: person.id,
                    role,
                    resources: all ? "*" : selected,
                  });
              }}
            >
              <p className="muted">
                保存后，该成员的现有登录和相关未兑换邀请会失效。成员需要新的邀请才能重新登录。
              </p>
              {error && (
                <p role="alert" className="error-text">
                  {error}
                </p>
              )}
              {pending && (
                <p role="status">
                  已有人员操作尚待核对，本次编辑不会覆盖原请求。
                </p>
              )}
              <Selector
                label="成员角色"
                value={role}
                onChange={(value) => {
                  if (
                    value === "viewer" ||
                    value === "sender" ||
                    value === "driver" ||
                    value === "admin"
                  )
                    setRole(value);
                }}
                isDisabled={blocked}
                controlClassName="touch-control"
                options={Object.entries(roleNames).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <fieldset className="flow">
                <legend>Conversation 访问范围</legend>
                <label className="actions">
                  <input
                    type="checkbox"
                    checked={all}
                    disabled={blocked}
                    onChange={(event) => setAll(event.target.checked)}
                  />
                  全部 Conversation（包括之后创建的对象）
                </label>
                {!all &&
                  [...available].map(([id, label]) => (
                    <label className="actions" key={id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(id)}
                        disabled={blocked}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, id]
                              : current.filter((value) => value !== id),
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
              </fieldset>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="actions">
              <Button
                label="保存成员权限"
                type="submit"
                form={formId}
                isDisabled={blocked || (!all && !selected.length)}
              />
              {pending && pending !== "unreadable" && (
                <Button
                  label="核对原权限操作"
                  variant="ghost"
                  isDisabled={busy}
                  onClick={() => void lookup()}
                />
              )}
              <Button label="关闭" variant="ghost" onClick={close} />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
