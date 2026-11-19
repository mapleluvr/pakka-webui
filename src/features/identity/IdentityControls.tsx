import { useId, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";

export interface LoginCredential {
  readonly kind: "session" | "invite";
  readonly token: string;
  readonly name?: string;
}

export function useIdentityControls(props: {
  connection: PakkaConnection | null;
  busy: boolean;
  error: string | null;
  initialCredential?: LoginCredential;
  login(credential?: LoginCredential): Promise<boolean>;
  logout(): Promise<void>;
}) {
  const formId = useId();
  const [open, setOpen] = useState(!!props.initialCredential);
  const [kind, setKind] = useState<"session" | "invite">(
    props.initialCredential?.kind ?? "session",
  );
  const [token, setToken] = useState(props.initialCredential?.token ?? "");
  const [name, setName] = useState("");
  const controls = (
    <div className="identity flow">
      {props.connection ? (
        <>
          <p className="identity-name">{props.connection.person.name}</p>
          <p className="muted">已连接 Pakka</p>
          <Button
            label="退出登录"
            variant="ghost"
            isDisabled={props.busy}
            onClick={() => {
              void props.logout();
            }}
          />
        </>
      ) : (
        <>
          <p className="muted">{props.busy ? "正在连接…" : "尚未连接 Pakka"}</p>
          <Button label="登录 Pakka" onClick={() => setOpen(true)} />
          <Button
            label="重新连接"
            variant="ghost"
            isDisabled={props.busy}
            onClick={() => {
              void props.login();
            }}
          />
        </>
      )}
    </div>
  );
  const dialog = (
    <Dialog
      isOpen={open && !props.connection}
      onOpenChange={setOpen}
      aria-label="登录 Pakka"
    >
      <Layout
        header={
          <LayoutHeader>
            <h1>登录 Pakka</h1>
          </LayoutHeader>
        }
        content={
          <LayoutContent label="登录信息">
            <form
              id={formId}
              className="flow"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  props.busy ||
                  !token.trim() ||
                  (kind === "invite" && !name.trim())
                )
                  return;
                void props
                  .login({
                    kind,
                    token: token.trim(),
                    ...(kind === "invite" ? { name: name.trim() } : {}),
                  })
                  .then((done) => {
                    if (done) {
                      setToken("");
                      setOpen(false);
                    }
                  });
              }}
            >
              <p className="muted">
                使用 Pakka 提供的登录凭据或邀请。凭据仅发送到当前连接的 Pakka。
              </p>
              <fieldset className="radio-row">
                <legend>凭据类型</legend>
                <label>
                  <input
                    type="radio"
                    name="credential-kind"
                    checked={kind === "session"}
                    onChange={() => setKind("session")}
                  />
                  登录凭据
                </label>
                <label>
                  <input
                    type="radio"
                    name="credential-kind"
                    checked={kind === "invite"}
                    onChange={() => setKind("invite")}
                  />
                  邀请
                </label>
              </fieldset>
              <TextInput
                label="登录凭据"
                type="password"
                value={token}
                onChange={setToken}
                autoComplete="one-time-code"
                controlClassName="touch-control"
                isRequired
              />
              {kind === "invite" && (
                <TextInput
                  label="你的名字"
                  value={name}
                  onChange={setName}
                  autoComplete="name"
                  controlClassName="touch-control"
                  isRequired
                />
              )}
              {props.error && (
                <p role="alert" className="error-text">
                  {props.error}
                </p>
              )}
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="actions">
              <Button
                label={props.busy ? "正在登录…" : "登录"}
                type="submit"
                form={formId}
                isDisabled={
                  props.busy ||
                  !token.trim() ||
                  (kind === "invite" && !name.trim())
                }
              />
              <Button
                label="取消"
                variant="ghost"
                type="button"
                onClick={() => setOpen(false)}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
  return { controls, dialog };
}
