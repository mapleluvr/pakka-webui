import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import type { UiViewProps } from "@pakka/webui-sdk";
import type { PocketClientResult } from "@pakka/client/pocket";
import type { PocketNavigation, PocketPerson } from "@pakka/protocol/pocket";
import type { PeopleAction } from "@pakka/protocol/webui";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import { InvitationForm, roleNames } from "./InvitationForm.js";
import { PersonEditor } from "./PersonEditor.js";
import { usePeopleChange } from "./usePeopleChange.js";
import { usePeopleSettings } from "./usePeopleSettings.js";

type Listing = Extract<PocketClientResult, { kind: "people" }>;
type Confirmation = { title: string; detail: string; action: PeopleAction };

export function PeopleView({ ui, bindings }: UiViewProps<PakkaConnection>) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [resources, setResources] = useState<readonly PocketNavigation[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<PocketPerson | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const settings = usePeopleSettings(bindings);
  const personal = settings.mode === "personal";
  const otherMembers = listing?.people.some(
    (person) => person.active && person.id !== bindings.person.id,
  );
  const change = usePeopleChange(ui, bindings);
  const blocked = change.busy || !!change.pending;
  const alive = () => !ui.signal.aborted && !bindings.signal.aborted;
  const refresh = () => {
    if (alive()) setRevision((value) => value + 1);
  };
  useEffect(() => {
    const lifetime = new AbortController();
    const signal = AbortSignal.any([
      requestSignal(ui.signal, bindings),
      lifetime.signal,
    ]);
    setLoading(true);
    setError(null);
    void Promise.all([
      bindings.workbench.request({ op: "people" }, { signal }),
      bindings.workbench.request({ op: "list" }, { signal }),
      bindings.refreshPeopleSettings(),
    ])
      .then(([people, conversations]) => {
        if (signal.aborted) return;
        if (people.kind !== "people" || conversations.kind !== "list")
          throw new Error("人员清单未得到确认。");
        setListing(people);
        setResources(conversations.navigation ?? []);
      })
      .catch((reason) => {
        if (!signal.aborted) {
          setListing(null);
          setResources([]);
          setEditing(null);
          setConfirm(null);
          setError(describeFailure(reason));
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => lifetime.abort();
  }, [ui, bindings, revision]);
  async function apply(action?: PeopleAction) {
    const original =
      action ??
      (change.pending && change.pending !== "unreadable"
        ? change.pending.action
        : undefined);
    const receipt = await change.run(action);
    if (!alive() || !receipt) return;
    setEditing(null);
    setConfirm(null);
    setNotice(
      original?.op === "mode.set"
        ? `已切换为${original.mode === "personal" ? "个人模式" : "协作模式"}。`
        : original?.op === "device.revoke"
          ? "该设备已退出登录。"
          : original?.op === "invite.revoke"
            ? "该连接链接已撤销。"
            : "成员访问设置已更新。",
    );
    refresh();
  }
  function scope(person: PocketPerson) {
    return person.resources === "*"
      ? "全部 Conversation"
      : person.resources
          .map(
            (id) => resources.find((row) => row.resourceId === id)?.name ?? id,
          )
          .join("、");
  }
  const pendingLabel =
    change.pending && change.pending !== "unreadable"
      ? change.pending.action.op === "mode.set"
        ? `切换为${change.pending.action.mode === "personal" ? "个人模式" : "协作模式"}`
        : change.pending.action.op === "device.revoke"
          ? `撤销设备 ${change.pending.action.id.slice(0, 8)}`
          : change.pending.action.op === "invite.revoke"
            ? "撤销连接链接"
            : "修改成员访问"
      : "修改设备与访问";
  const originalPerson =
    change.pending &&
    change.pending !== "unreadable" &&
    change.pending.action.op === "person.set"
      ? change.pending.action.personId
      : null;
  return (
    <section className="flow">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>设备与访问</h1>
        </div>
        <Button
          label="刷新设备与访问"
          variant="ghost"
          isDisabled={loading}
          onClick={refresh}
        />
      </header>
      <p className="muted">
        {personal
          ? "在电脑、手机和终端使用同一个身份，接续同一份工作。每台设备可以单独退出。"
          : "管理连接的设备、成员角色和 Conversation 访问范围。"}
      </p>
      {(error || change.error) && (
        <p role="alert" className="error-text">
          {error ?? change.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {change.pending && (
        <section
          className="saved-banner flow"
          aria-label="设备与访问修改待确认"
        >
          <p>
            {change.pending === "unreadable"
              ? "这台设备上保存的修改请求无法读取，设备与访问修改已暂停。"
              : `“${pendingLabel}”的结果尚未确认。`}
          </p>
          {change.pending !== "unreadable" && (
            <>
              <code className="identifier">{change.pending.requestId}</code>
              <div className="actions">
                <Button
                  label="查看这次修改结果"
                  isDisabled={change.busy}
                  onClick={() => void apply()}
                />
                {originalPerson && (
                  <Button
                    label="查看原权限编辑"
                    variant="ghost"
                    isDisabled={
                      !listing?.people.some(
                        (person) => person.id === originalPerson,
                      )
                    }
                    onClick={() =>
                      setEditing(
                        listing?.people.find(
                          (person) => person.id === originalPerson,
                        ) ?? null,
                      )
                    }
                  />
                )}
              </div>
            </>
          )}
        </section>
      )}
      <section className="surface flow" aria-label="使用模式">
        <h2>{personal ? "个人模式" : "协作模式"}</h2>
        <p className="muted">
          {personal
            ? "所有设备使用同一个身份与操作权限，无需领取或续期对话控制权。"
            : "协作模式为不同成员分别设置角色和访问范围。"}
        </p>
        {!personal && otherMembers && (
          <p>启用个人模式前，请先撤销其他成员的访问。</p>
        )}
        <div>
          <Button
            label={personal ? "切换到协作模式" : "启用个人模式"}
            variant="ghost"
            isDisabled={
              blocked || loading || !listing || (!personal && otherMembers)
            }
            onClick={() =>
              setConfirm({
                title: personal ? "切换到协作模式" : "启用个人模式",
                detail: personal
                  ? "你的设备继续使用同一个身份。之后可以邀请其他成员，并分别设置他们的权限。"
                  : "已连接的本人设备保留登录；尚未兑换的新成员邀请将失效。对话、历史和 Agent 工具权限保持原有设置。",
                action: {
                  op: "mode.set",
                  mode: personal ? "collaboration" : "personal",
                  expectedVersion: settings.version,
                },
              })
            }
          />
        </div>
      </section>
      {loading && <p role="status">正在读取设备与访问…</p>}
      {listing && (
        <>
          <section className="flow" aria-label="我的设备">
            <h2>我的设备</h2>
            <ul className="resource-list">
              {settings.devices.map((device) => (
                <li className="surface feature-heading" key={device.id}>
                  <div>
                    <h3>
                      {device.current
                        ? "当前设备"
                        : `设备 ${device.id.slice(0, 8)}`}
                    </h3>
                    <p className="muted">
                      登录有效期至 {new Date(device.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  {!device.current && (
                    <Button
                      label={`退出设备 ${device.id.slice(0, 8)}`}
                      variant="ghost"
                      isDisabled={blocked}
                      onClick={() =>
                        setConfirm({
                          title: "让此设备退出登录",
                          detail:
                            "此设备的登录将失效。其他设备和已保存的工作继续保留。",
                          action: { op: "device.revoke", id: device.id },
                        })
                      }
                    >
                      退出登录
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {!personal && (
            <section className="flow" aria-label="成员清单">
              <h2>成员</h2>
              <ul className="resource-list">
                {listing.people.map((person) => (
                  <li className="surface flow compact" key={person.id}>
                    <div className="feature-heading">
                      <h3>
                        {person.name}
                        {person.id === bindings.person.id ? "（当前身份）" : ""}
                      </h3>
                      <p>{person.active ? roleNames[person.role] : "已撤销"}</p>
                    </div>
                    <p className="identifier">{person.id}</p>
                    <p className="muted">{scope(person)}</p>
                    {person.active && person.id !== bindings.person.id && (
                      <div className="actions">
                        <Button
                          label={`修改权限：${person.name}`}
                          variant="ghost"
                          isDisabled={blocked}
                          onClick={() => setEditing(person)}
                        >
                          修改权限
                        </Button>
                        <Button
                          label={`撤销访问：${person.name}`}
                          variant="ghost"
                          isDisabled={blocked}
                          onClick={() =>
                            setConfirm({
                              title: `撤销 ${person.name} 的访问`,
                              detail:
                                "该成员的登录与其签发的待兑换邀请将失效。已保存的 Conversation 与历史仍保留。",
                              action: { op: "person.revoke", id: person.id },
                            })
                          }
                        >
                          撤销访问
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <InvitationForm
            key={settings.mode}
            personal={personal}
            ui={ui}
            connection={bindings}
            people={listing.people}
            resources={resources}
            refresh={refresh}
          />
          <section className="flow" aria-label="邀请清单">
            <h2>{personal ? "设备连接记录" : "邀请记录"}</h2>
            <p className="muted">
              {personal
                ? "已兑换的链接不能再次使用。待兑换的链接可以随时撤销。"
                : "清单只显示邀请状态。邀请密钥仅在首次创建的响应中交付。"}
            </p>
            {!listing.invites.length && (
              <p>{personal ? "暂无设备连接记录。" : "暂无邀请。"}</p>
            )}
            <ul className="resource-list">
              {[...listing.invites].reverse().map((invite) => (
                <li className="surface flow compact" key={invite.id}>
                  <p className="identifier">{invite.id}</p>
                  <p>
                    {!personal && roleNames[invite.role]}
                    {!personal && " · "}
                    {invite.status === "revoked"
                      ? "已撤销"
                      : invite.status === "redeemed"
                        ? "已兑换"
                        : invite.expiresAt <= Date.now()
                          ? "已过期"
                          : "待兑换"}
                    {" · "}
                    {new Date(invite.expiresAt).toLocaleString()}
                  </p>
                  {!personal && (
                    <p className="muted">
                      {invite.resources === "*"
                        ? "全部 Conversation"
                        : invite.resources
                            .map(
                              (id) =>
                                resources.find((row) => row.resourceId === id)
                                  ?.name ?? id,
                            )
                            .join("、")}
                    </p>
                  )}
                  {invite.status === "pending" && (
                    <div>
                      <Button
                        label={`${personal ? "撤销链接" : "撤销邀请"} ${invite.id}`}
                        variant="ghost"
                        isDisabled={blocked}
                        onClick={() =>
                          setConfirm({
                            title: personal
                              ? "撤销设备连接链接"
                              : "撤销一次性邀请",
                            detail: `撤销后，此链接将失效：${invite.id}`,
                            action: { op: "invite.revoke", id: invite.id },
                          })
                        }
                      >
                        {personal ? "撤销链接" : "撤销邀请"}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {editing && (
        <PersonEditor
          key={editing.id}
          person={editing}
          resources={resources}
          pending={change.pending}
          busy={change.busy}
          error={change.error}
          save={apply}
          lookup={() => apply()}
          close={() => setEditing(null)}
        />
      )}
      {confirm && (
        <Dialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
          aria-label={confirm.title}
        >
          <Layout
            header={
              <LayoutHeader>
                <h1>{confirm.title}</h1>
              </LayoutHeader>
            }
            content={
              <LayoutContent label="确认访问变更">
                <div className="flow">
                  <p>{confirm.detail}</p>
                  {change.error && (
                    <p role="alert" className="error-text">
                      {change.error}
                    </p>
                  )}
                  {change.pending && (
                    <p role="status">“{pendingLabel}”的结果尚未确认。</p>
                  )}
                </div>
              </LayoutContent>
            }
            footer={
              <LayoutFooter hasDivider>
                <div className="actions">
                  <Button
                    label={
                      confirm.action.op === "mode.set" ? "确认切换" : "确认撤销"
                    }
                    isDisabled={blocked}
                    onClick={() => void apply(confirm.action)}
                  />
                  {change.pending && change.pending !== "unreadable" && (
                    <Button
                      label="查看这次修改结果"
                      isDisabled={change.busy}
                      onClick={() => void apply()}
                    />
                  )}
                  <Button
                    label="关闭"
                    variant="ghost"
                    onClick={() => setConfirm(null)}
                  />
                </div>
              </LayoutFooter>
            }
          />
        </Dialog>
      )}
    </section>
  );
}
