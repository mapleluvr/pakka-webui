import type { ReactNode } from "react";
import { ReadingIcon } from "./ReadingIcons.js";
import { useDisclosure } from "./ReadingState.js";
import { TextContent, type ContentBindings } from "./TextContent.js";
import type { ReplyIssue } from "./transcript.js";

export function ReplyIssueCard({
  issue,
  identity,
  actions,
  ...bindings
}: ContentBindings & {
  issue: ReplyIssue;
  identity: string;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useDisclosure(identity);
  const stopped = issue.stopped;
  return (
    <section
      className="reply-issue"
      aria-label={issue.title}
      data-stopped={stopped || undefined}
    >
      <header className="reply-issue-heading">
        <svg
          className="reply-issue-icon"
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.65"
        >
          <circle cx="12" cy="12" r="9" />
          {stopped ? (
            <path d="M10 9v6m4-6v6" />
          ) : (
            <>
              <path d="M12 7.5v5" />
              <circle
                cx="12"
                cy="16"
                r=".9"
                fill="currentColor"
                stroke="none"
              />
            </>
          )}
        </svg>
        <h3>{issue.title}</h3>
        {issue.http && (
          <span className="reply-issue-code">HTTP {issue.http}</span>
        )}
        {actions && <div className="reply-issue-actions">{actions}</div>}
      </header>
      <p>{issue.reason}</p>
      {issue.hint && <p className="reply-issue-hint">{issue.hint}</p>}
      {(issue.detail || issue.reference) && (
        <details
          className="reply-issue-details"
          open={open}
          onToggle={(e) => setOpen(e.currentTarget.open)}
        >
          <summary className="reader-action">
            <ReadingIcon name="chevron" />
            技术详情
          </summary>
          {open && (
            <TextContent
              panel={{ title: "错误记录" }}
              text={issue.detail}
              reference={issue.reference}
              {...bindings}
            />
          )}
        </details>
      )}
    </section>
  );
}
