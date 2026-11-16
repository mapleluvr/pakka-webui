import { useCallback, useEffect, useRef, useState } from "react";
import { PocketRemoteError } from "@pakka/client/pocket";
import {
  connectPakka,
  describeFailure,
  exchangeCredential,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import type { LoginCredential } from "./IdentityControls.js";

export function usePakkaConnection() {
  const [connection, setConnection] = useState<PakkaConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const current = useRef<PakkaConnection | null>(null);
  const admitting = useRef(false);
  const mounted = useRef(true);
  const login = useCallback(
    async (credential?: LoginCredential): Promise<boolean> => {
      if (admitting.current) return false;
      admitting.current = true;
      setBusy(true);
      setError(null);
      controller.current?.abort();
      current.current = null;
      setConnection(null);
      const lifetime = new AbortController();
      controller.current = lifetime;
      try {
        if (credential)
          await exchangeCredential(
            location.origin,
            credential,
            lifetime.signal,
          );
        const next = await connectPakka(
          location.origin,
          lifetime.signal,
          () => {
            if (!mounted.current || controller.current !== lifetime) return;
            lifetime.abort();
            current.current = null;
            setConnection(null);
            setError("登录已失效，请重新登录 Pakka。");
          },
        );
        if (!mounted.current || lifetime.signal.aborted) return false;
        current.current = next;
        setConnection(next);
        return true;
      } catch (reason) {
        if (mounted.current && !lifetime.signal.aborted) {
          if (
            reason instanceof PocketRemoteError &&
            !credential &&
            reason.code === "UNAUTHORIZED"
          )
            setError(null);
          else if (
            reason instanceof PocketRemoteError &&
            !credential &&
            reason.code === "UNKNOWN"
          )
            setError("当前无法确认与 Pakka 的连接，请检查服务后重新连接。");
          else setError(describeFailure(reason));
        }
        return false;
      } finally {
        admitting.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [],
  );
  const logout = useCallback(async () => {
    if (admitting.current || !current.current) return;
    admitting.current = true;
    setBusy(true);
    setError(null);
    const previous = current.current;
    current.current = null;
    setConnection(null);
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      await previous.workbench.request(
        { op: "session.logout" },
        { signal: request.signal },
      );
    } catch (reason) {
      if (mounted.current)
        setError(`界面已断开，服务端退出尚未确认。${describeFailure(reason)}`);
    } finally {
      admitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void login();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [login]);
  return { connection, busy, error, login, logout };
}

export function takeLoginCredential(): LoginCredential | undefined {
  if (!/^#(?:session|invite)=/.test(location.hash)) return;
  const input = new URLSearchParams(location.hash.slice(1));
  // Remove credentials from the address before rendering or issuing a request.
  history.replaceState(null, "", location.pathname + location.search + "#/");
  const session = input.get("session"),
    invite = input.get("invite");
  if (session && !invite) return { kind: "session", token: session };
  if (invite && !session) return { kind: "invite", token: invite };
  return;
}
