export function ComposerIcon({
  name,
}: {
  name:
    | "plus"
    | "send"
    | "stop"
    | "expand"
    | "close"
    | "search"
    | "history"
    | "width";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "send" && <path d="m6 11 6-6 6 6M12 5v14" />}
      {name === "stop" && (
        <rect
          x="7"
          y="7"
          width="10"
          height="10"
          rx="2"
          fill="currentColor"
          stroke="none"
        />
      )}
      {name === "expand" && (
        <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
      )}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
      {name === "search" && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      )}
      {name === "history" && (
        <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v6l4 2" />
      )}
      {name === "width" && (
        <path d="M4 4v16M20 4v16M7 12h10m-7-3-3 3 3 3m4-6 3 3-3 3" />
      )}
    </svg>
  );
}
export function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="m9 3-.6 2.4-2.1 1.2L4 6l-2 3.5 1.7 1.8v2.4L2 15.5 4 19l2.3-.6 2.1 1.2L9 22h4l.6-2.4 2.1-1.2 2.3.6 2-3.5-1.7-1.8v-2.4L20 9.5 18 6l-2.3.6-2.1-1.2L13 3Z" />
      <circle cx="11" cy="12.5" r="3" />
    </svg>
  );
}
export function MicrophoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </svg>
  );
}
