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
    const receipt = await change.run(action);
    if (!alive() || !receipt) return;
    setEditing(null);
    setConfirm(null);
    setNotice(`人员操作已确认，记录版本 ${receipt.version}。`);
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
          <h1>人员与邀请</h1>
        </div>
        <Button
          label="刷新人员与邀请"
          variant="ghost"
          isDisabled={loading}
          onClick={refresh}
        />
      </header>
      <p className="muted">
        管理人类成员的角色、Conversation
        访问范围和一次性邀请。权限变更会使该成员的现有登录失效。
      </p>
      {(error || change.error) && (
        <p role="alert" className="error-text">
          {error ?? change.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {change.pending && (
        <section className="saved-banner flow" aria-label="人员操作待核对">
          <p>
            {change.pending === "unreadable"
              ? "本地原请求无法读取，人员写入已暂停，请由管理员核对。"
              : "原人员操作尚未确认，不能重新提交。"}
          </p>
          {change.pending !== "unreadable" && (
            <>
              <code className="identifier">{change.pending.requestId}</code>
              <div className="actions">
                <Button
                  label="核对人员原请求"
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
      {loading && <p role="status">正在读取人员与邀请…</p>}
      {listing && (
        <>
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
          <InvitationForm
            ui={ui}
            connection={bindings}
            people={listing.people}
            resources={resources}
            refresh={refresh}
          />
          <section className="flow" aria-label="邀请清单">
            <h2>邀请记录</h2>
            <p className="muted">
              清单只显示邀请状态。邀请密钥仅在首次创建的响应中交付。
            </p>
            {!listing.invites.length && <p>暂无邀请。</p>}
            <ul className="resource-list">
              {[...listing.invites].reverse().map((invite) => (
                <li className="surface flow compact" key={invite.id}>
                  <p className="identifier">{invite.id}</p>
                  <p>
                    {roleNames[invite.role]}
                    {" · "}
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
                  {invite.status === "pending" && (
                    <div>
                      <Button
                        label={`撤销邀请 ${invite.id}`}
                        variant="ghost"
                        isDisabled={blocked}
                        onClick={() =>
                          setConfirm({
                            title: "撤销一次性邀请",
                            detail: `撤销后，此邀请将不能兑换：${invite.id}`,
                            action: { op: "invite.revoke", id: invite.id },
                          })
                        }
                      >
                        撤销邀请
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
                    <p role="status">原操作尚待核对，未再次提交。</p>
                  )}
                </div>
              </LayoutContent>
            }
            footer={
              <LayoutFooter hasDivider>
                <div className="actions">
                  <Button
                    label="确认撤销"
                    isDisabled={blocked}
                    onClick={() => void apply(confirm.action)}
                  />
                  {change.pending && change.pending !== "unreadable" && (
                    <Button
                      label="核对原撤销"
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
