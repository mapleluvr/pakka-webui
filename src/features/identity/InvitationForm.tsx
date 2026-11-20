import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import type { UiContext } from "@pakka/webui-sdk";
import type {
  PocketNavigation,
  PocketPerson,
  PocketRole,
} from "@pakka/protocol/pocket";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import { useInvitation } from "./useInvitation.js";

export const roleNames: Record<PocketRole, string> = {
  viewer: "只读",
  sender: "可发送",
  driver: "可调度",
  admin: "管理员",
};
export function InvitationForm({
  ui,
  connection,
  people,
  resources,
  refresh,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  people: readonly PocketPerson[];
  resources: readonly PocketNavigation[];
  refresh(): void;
}) {
  const invitation = useInvitation(ui, connection);
  const restored =
    invitation.pending && invitation.pending !== "unreadable"
      ? invitation.pending
      : null;
  const [personId, setPersonId] = useState(restored?.personId ?? "");
  const [role, setRole] = useState<PocketRole>(restored?.role ?? "viewer");
  const [all, setAll] = useState(restored?.resources === "*");
  const [selected, setSelected] = useState<readonly string[]>(
    restored?.resources && restored.resources !== "*" ? restored.resources : [],
  );
  const [ttlMs, setTtlMs] = useState(String(restored?.ttlMs ?? 3600000));
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const target = personId
    ? people.find((person) => person.id === personId && person.active)
    : undefined;
  const scope = target?.resources ?? (all ? "*" : selected);
  const blocked = invitation.busy || !!invitation.pending;
  const result = invitation.result;
  const link = result?.token
    ? `${connection.origin}/#invite=${result.token}`
    : null;
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus("邀请链接已复制。");
    } catch {
      setCopyStatus("无法访问剪贴板，可选择邀请链接后手动复制。");
    }
  }
  return (
    <section className="surface flow" aria-label="创建邀请">
      <h2>邀请与新设备登录</h2>
      <p className="muted">
        邀请仅可兑换一次，过期后失效。为已有成员创建邀请时沿用其当前角色与资源授权。
      </p>
      {invitation.error && (
        <p role="alert" className="error-text">
          {invitation.error}
        </p>
      )}
      {invitation.pending && (
        <div className="saved-banner flow" aria-label="邀请待核对请求">
          <p>
            {invitation.pending === "unreadable"
              ? "本地原请求无法读取，已阻止创建；请由管理员核对。"
              : "邀请结果尚未确认，请先核对原请求。"}
          </p>
          {invitation.pending !== "unreadable" && (
            <>
              <code className="identifier">{invitation.pending.requestId}</code>
              <Button
                label="核对邀请原请求"
                isDisabled={invitation.busy}
                onClick={() => {
                  void invitation.lookup().then(refresh);
                }}
              />
            </>
          )}
        </div>
      )}
      <form
        className="flow"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            blocked ||
            (personId && !target) ||
            (scope !== "*" && !scope.length)
          )
            return;
          setCopyStatus(null);
          void invitation
            .create({
              role: target?.role ?? role,
              resources: scope,
              ttlMs: Number(ttlMs),
              ...(personId ? { personId } : {}),
            })
            .then(refresh);
        }}
      >
        <Selector
          label="邀请对象"
          value={personId}
          onChange={setPersonId}
          isDisabled={blocked}
          controlClassName="touch-control"
          options={[
            { value: "", label: "新成员" },
            ...people
              .filter((person) => person.active)
              .map((person) => ({
                value: person.id,
                label: `${person.name} · ${person.id.slice(0, 8)}`,
              })),
          ]}
        />
        {personId && !target && (
          <p role="alert">原成员已不可用，请刷新并核对身份。</p>
        )}
        {target ? (
          <p>
            当前角色：{roleNames[target.role]}；资源：
            {target.resources === "*"
              ? "全部 Conversation"
              : target.resources
                  .map(
                    (id) =>
                      resources.find((row) => row.resourceId === id)?.name ??
                      id,
                  )
                  .join("、")}
            。
          </p>
        ) : (
          <>
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
            <p className="muted">
              只读仅浏览；可发送增加普通输入；可调度增加插入、后续输入与停止。管理员可管理已授权对象；实例管理另需全部资源授权。
            </p>
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
              {!all && (
                <div className="flow compact">
                  {resources
                    .filter((row) => row.resourceId)
                    .map((row) => (
                      <label className="actions" key={row.resourceId}>
                        <input
                          type="checkbox"
                          checked={selected.includes(row.resourceId!)}
                          disabled={blocked}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, row.resourceId!]
                                : current.filter((id) => id !== row.resourceId),
                            )
                          }
                        />
                        <span>
                          {row.name} · {row.ref.sessionId.slice(0, 8)}
                          {" / "}
                          {row.ref.conversationId}
                        </span>
                      </label>
                    ))}
                  {resources.every((row) => !row.resourceId) && (
                    <p>暂无可选择的授权资源。</p>
                  )}
                </div>
              )}
            </fieldset>
          </>
        )}
        <Selector
          label="邀请有效期"
          value={ttlMs}
          onChange={setTtlMs}
          isDisabled={blocked}
          controlClassName="touch-control"
          options={[
            { value: "3600000", label: "1 小时" },
            { value: "86400000", label: "1 天" },
            { value: "604800000", label: "7 天" },
          ]}
        />
        <div>
          <Button
            label={invitation.busy ? "正在处理邀请…" : "创建一次性邀请"}
            type="submit"
            isDisabled={
              blocked ||
              (!!personId && !target) ||
              (scope !== "*" && scope.length === 0)
            }
          />
        </div>
      </form>
      {result && (
        <section className="flow" aria-label="已确认邀请">
          <h3>原邀请已确认</h3>
          <p className="identifier">{result.invite.id}</p>
          <p>
            有效期至 {new Date(result.invite.expiresAt).toLocaleString()}
            {" · "}
            {result.invite.status === "revoked"
              ? "已撤销"
              : result.invite.status === "redeemed"
                ? "已兑换"
                : result.invite.expiresAt <= Date.now()
                  ? "已过期"
                  : "待兑换"}
          </p>
          {link ? (
            <>
              <label className="field">
                邀请链接
                <input
                  aria-label="邀请链接"
                  type="password"
                  value={link}
                  readOnly
                  autoComplete="off"
                />
              </label>
              <div>
                <Button label="复制邀请链接" onClick={() => void copy()} />
              </div>
              {copyStatus && <p role="status">{copyStatus}</p>}
              {result.qr && (
                <img
                  src={result.qr}
                  alt="一次性邀请二维码"
                  width="256"
                  height="256"
                />
              )}
            </>
          ) : (
            <p role="status">
              邀请记录已找到。密钥只在首次响应中提供，无法取回；可在邀请清单撤销它，再显式创建新邀请。
            </p>
          )}
        </section>
      )}
    </section>
  );
}
