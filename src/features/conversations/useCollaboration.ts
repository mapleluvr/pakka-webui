import { useEffect, useMemo, useRef, useState } from "react";
import type { UiContext } from "@pakka/webui-sdk";
import { PocketRemoteError, type AgentRef } from "@pakka/client/pocket";
import {
  decodeCollaborationRequest,
  type CollaborationAction,
  type CollaborationReceipt,
  type CollaborationRequest,
  type CollaborationView,
} from "@pakka/protocol/webui";
import {
  describeFailure,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import {
  claimPending,
  clearPending,
  readPending,
} from "../../integrations/pakka/pending.js";
import { observeCollaboration } from "../../integrations/pakka/observation.js";

type Pending = CollaborationRequest | "unreadable";
export function collaborationScope(action: CollaborationAction): string {
  return action.kind === "react"
    ? JSON.stringify([action.kind, action.messageId, action.emoji])
    : action.kind === "pin"
      ? JSON.stringify([action.kind, action.messageId])
      : JSON.stringify([action.kind]);
}
export function collaborationRecords(
  connection: PakkaConnection,
  target: AgentRef,
) {
  const base = [
    "pakka-collaboration",
    connection.origin,
    connection.person.id,
    target.sessionId,
    target.conversationId,
  ];
  const prefix = JSON.stringify(base).slice(0, -1) + ",";
  const key = (scope: string) => JSON.stringify([...base, scope]);
  const decode = (scope: string) => (value: unknown) => {
    const request = decodeCollaborationRequest(value);
    if (
      request.target.sessionId !== target.sessionId ||
      request.target.conversationId !== target.conversationId ||
      collaborationScope(request.action) !== scope
    )
      throw new Error("协作原请求的资源或操作不符。");
    return request;
  };
  function all(): Map<string, Pending> {
    const found = new Map<string, Pending>();
    for (let index = 0; index < sessionStorage.length; index++) {
      const stored = sessionStorage.key(index);
      if (!stored?.startsWith(prefix)) continue;
      let fields: unknown;
      try {
        fields = JSON.parse(stored);
      } catch {
        throw new Error("协作原请求的存储身份不可读。");
      }
      if (
        !Array.isArray(fields) ||
        fields.length !== 6 ||
        typeof fields[5] !== "string"
      )
        throw new Error("协作原请求的存储身份不可读。");
      const scope = fields[5],
        request = readPending(stored, decode(scope));
      if (request) found.set(scope, request);
    }
    return found;
  }
  return { key, decode, all };
}
export function hasCollaborationPending(
  connection: PakkaConnection,
  target: AgentRef,
): boolean {
  try {
    return collaborationRecords(connection, target).all().size > 0;
  } catch {
    return true;
  }
}

/** The feature owns drafts/requests; the server owns shared state, effects and driver admission. */
export function useCollaboration(
  ui: UiContext,
  connection: PakkaConnection,
  target: AgentRef,
  publishPresence = true,
) {
  const identity = JSON.stringify(target);
  const lifetime = useMemo(
    () => new AbortController(),
    [ui, connection, identity],
  );
  const signal = useMemo(
    () => AbortSignal.any([ui.signal, connection.signal, lifetime.signal]),
    [ui, connection, lifetime],
  );
  const storage = useMemo(
    () => collaborationRecords(connection, target),
    [connection, target.sessionId, target.conversationId],
  );
  const [view, setView] = useState<CollaborationView | null>(null);
  const [pending, setPending] = useState<Map<string, Pending>>(() => {
    try {
      return storage.all();
    } catch {
      return new Map();
    }
  });
  const [storageError, setStorageError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [receipts, setReceipts] = useState<Map<string, CollaborationReceipt>>(
    new Map(),
  );
  const [busyScopes, setBusyScopes] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const [observation, setObservation] = useState("正在读取协作…");
  const [readError, setReadError] = useState<string | null>(null);
  const busy = useRef(new Map<string, symbol>());
  const reader = useRef<{
    controller: AbortController;
    refresh(): Promise<void>;
  } | null>(null);
  const typingAt = useRef(0);
  const alive = () => !signal.aborted;
  function reloadPending() {
    if (!alive()) return;
    try {
      setPending(storage.all());
      setStorageError(null);
    } catch {
      setStorageError("本地协作原请求不可读，请保留记录；当前阻止继续提交。");
    }
  }
  function message(scope: string, value: string | null) {
    if (!alive()) return;
    setErrors((previous) => {
      const next = new Map(previous);
      if (value) next.set(scope, value);
      else next.delete(scope);
      return next;
    });
  }
  useEffect(() => {
    const changed = () => {
      const next = document.visibilityState !== "hidden";
      if (!next) {
        reader.current?.controller.abort();
        setView(null);
      }
      setVisible(next);
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => () => lifetime.abort(), [lifetime]);
  useEffect(() => {
    reloadPending();
    setView(null);
    if (paused || !visible || signal.aborted) {
      setObservation("协作观察已暂停");
      return;
    }
    const controller = new AbortController();
    const readSignal = AbortSignal.any([signal, controller.signal]);
    let revision = 0,
      closeStream = () => {},
      retry: ReturnType<typeof setTimeout> | undefined;
    const current = () => !readSignal.aborted;
    const refresh = async () => {
      const requestRevision = ++revision;
      try {
        const result = await connection.services.request(
          { op: "collaboration.read", target },
          { signal: readSignal },
        );
        if (!current() || requestRevision !== revision) return;
        setView(result.view);
        setReadError(null);
      } catch (error) {
        if (current() && requestRevision === revision) {
          setView(null);
          setReadError(describeFailure(error));
        }
        throw error;
      }
    };
    const binding = { controller, refresh };
    reader.current = binding;
    async function connect() {
      if (!current()) return;
      closeStream();
      setView(null);
      setObservation("正在恢复协作观察…");
      try {
        await refresh();
        if (!current()) return;
        closeStream = observeCollaboration(
          connection,
          target,
          readSignal,
          (snapshot) => {
            if (current()) {
              setView((previous) =>
                previous && snapshot.version >= previous.snapshot.version
                  ? { ...previous, snapshot }
                  : previous,
              );
              setObservation("协作实时观察");
            }
          },
          () => {
            if (!current()) return;
            setView(null);
            setObservation("正在恢复协作观察…");
            retry = setTimeout(() => {
              void connect();
            }, 1000);
          },
        );
        setObservation("协作实时观察");
      } catch {
        if (current())
          retry = setTimeout(() => {
            void connect();
          }, 1000);
      }
    }
    void connect();
    return () => {
      controller.abort();
      closeStream();
      if (retry) clearTimeout(retry);
      if (reader.current === binding) reader.current = null;
    };
  }, [signal, storage, paused, visible]);

  useEffect(() => {
    if (signal.aborted || paused || !visible || !publishPresence) return;
    let sending = false;
    async function publish(
      state: "here" | "typing" | "away",
      ownSignal: AbortSignal,
    ) {
      if (
        sending ||
        ownSignal.aborted ||
        connection.peopleSettings.mode === "personal"
      )
        return;
      sending = true;
      try {
        await connection.workbench.request(
          { op: "collaboration.presence", target, input: { state } },
          { signal: ownSignal },
        );
      } catch {
        /* Ephemeral presence has no durable receipt or write lock. */
      } finally {
        sending = false;
      }
    }
    const heartbeat = () => {
      void publish(
        Date.now() - typingAt.current < 5000 ? "typing" : "here",
        signal,
      );
    };
    heartbeat();
    const interval = setInterval(heartbeat, 10000);
    return () => {
      clearInterval(interval);
      // Leaving is an ephemeral update; its result is never read into a closed panel.
      if (connection.peopleSettings.mode !== "personal")
        void connection.workbench
          .request(
            { op: "collaboration.presence", target, input: { state: "away" } },
            { signal: connection.signal },
          )
          .catch(() => {});
    };
  }, [signal, paused, visible, publishPresence]);

  async function perform(
    action: CollaborationAction | null,
    scope: string,
  ): Promise<CollaborationReceipt | null> {
    if (!alive() || busy.current.has(scope)) return null;
    const token = Symbol(scope);
    busy.current.set(scope, token);
    setBusyScopes(new Set(busy.current.keys()));
    message(scope, null);
    let original: CollaborationRequest | null = null;
    try {
      if (action) {
        if (!view || storageError) return null;
        const candidate = decodeCollaborationRequest({
          requestId: crypto.randomUUID(),
          target: view.target,
          action,
        });
        const claimed = claimPending(
          storage.key(scope),
          candidate,
          storage.decode(scope),
        );
        reloadPending();
        if (claimed === "unreadable") {
          message(scope, "原请求不可读，请保留记录，勿重复提交。");
          return null;
        }
        if (claimed.requestId !== candidate.requestId) {
          message(scope, "此操作已有待核对的原请求。");
          return null;
        }
        original = claimed;
      } else {
        const stored = readPending(storage.key(scope), storage.decode(scope));
        if (!stored || stored === "unreadable") return null;
        original = stored;
      }
      const reply = action
        ? await connection.services.request(
            { op: "collaboration.write", change: original },
            { signal },
          )
        : await connection.services.request(
            { op: "collaboration.lookup", original },
            { signal },
          );
      const receipt = reply.receipt;
      if (!receipt) {
        message(scope, "尚未找到原请求回执，仍保持待核对。");
        return null;
      }
      clearPending(
        storage.key(scope),
        original.requestId,
        storage.decode(scope),
      );
      if (alive()) {
        setReceipts((previous) => new Map(previous).set(scope, receipt));
        reloadPending();
        await reader.current?.refresh().catch(() => {});
      }
      return receipt;
    } catch (error) {
      if (
        action &&
        original &&
        error instanceof PocketRemoteError &&
        error.outcome === "denied"
      ) {
        try {
          clearPending(
            storage.key(scope),
            original.requestId,
            storage.decode(scope),
          );
        } catch {
          /* Keep the unreadable slot locked. */
        }
      }
      reloadPending();
      message(
        scope,
        error instanceof PocketRemoteError && error.code === "CONFLICT"
          ? "共享状态已变化；原请求未生效，草稿已保留。"
          : describeFailure(error),
      );
      return null;
    } finally {
      if (busy.current.get(scope) === token) busy.current.delete(scope);
      if (alive()) setBusyScopes(new Set(busy.current.keys()));
    }
  }
  function pause() {
    reader.current?.controller.abort();
    setView(null);
    setPaused(true);
  }
  return {
    signal,
    view,
    pending,
    errors,
    receipts,
    busyScopes,
    paused,
    observation,
    readError,
    storageError,
    act: (action: CollaborationAction) =>
      perform(action, collaborationScope(action)),
    reconcile: (scope: string) => perform(null, scope),
    pause,
    resume: () => setPaused(false),
    typing: () => {
      typingAt.current = Date.now();
    },
  };
}
