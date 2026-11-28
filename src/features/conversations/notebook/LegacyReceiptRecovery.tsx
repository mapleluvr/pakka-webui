import { useState } from "react";
import type { PakkaConnection } from "../../../integrations/pakka/connection.js";
import { describeFailure } from "../../../integrations/pakka/connection.js";
import { clearPending } from "../../../integrations/pakka/pending.js";
import { collaborationRecords } from "../useCollaboration.js";
import type { AgentRef } from "@pakka/protocol/pocket";
/** Old request recovery is available without mounting the human feed or starting presence. */
export function LegacyReceiptRecovery({
  connection,
  target,
}: {
  connection: PakkaConnection;
  target: AgentRef;
}) {
  const [notice, setNotice] = useState("");
  const storage = collaborationRecords(connection, target);
  let pending;
  try {
    pending = storage.all();
  } catch {
    return <p role="alert">历史原请求存储不可读。</p>;
  }
  if (!pending.size && !notice) return null;
  return (
    <aside>
      {[...pending].map(([scope, r]) => (
        <button
          key={scope}
          disabled={r === "unreadable"}
          onClick={async () => {
            if (r === "unreadable") return;
            try {
              const { receipt } = await connection.services.request(
                { op: "collaboration.lookup", original: r },
                { signal: connection.signal },
              );
              if (receipt)
                clearPending(
                  storage.key(scope),
                  r.requestId,
                  storage.decode(scope),
                );
              setNotice(
                receipt ? "已确认历史原请求" : "尚未找到历史原回执，不会重发。",
              );
            } catch (e) {
              setNotice(describeFailure(e));
            }
          }}
        >
          核对历史原请求{r === "unreadable" ? "（不可读）" : ""}
        </button>
      ))}
      {notice && <p role="status">{notice}</p>}
    </aside>
  );
}
