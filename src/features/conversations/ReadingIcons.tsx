/** Decorative line icons for labelled reading controls. */
export function ReadingIcon({
  name,
}: {
  name: "chevron" | "refresh" | "latest" | "pause" | "processing";
}) {
  return (
    <svg
      className="reading-icon"
      data-icon={name}
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "chevron" && <path d="m7 5 5 5-5 5" />}
      {name === "refresh" && (
        <path d="M16.2 9a6.3 6.3 0 1 0-1.2 4.9M16.3 3.8v5.3H11" />
      )}
      {name === "latest" && <path d="M10 3v10m-4-4 4 4 4-4M4 16.5h12" />}
      {name === "pause" && <path d="M7 4.5v11m6-11v11" />}
      {name === "processing" && (
        <>
          <circle cx="10" cy="10" r="6.5" opacity=".24" />
          <path d="M10 3.5a6.5 6.5 0 0 1 6.5 6.5" />
        </>
      )}
    </svg>
  );
}
export function OriginalIcon() {
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
      <path d="M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5M6 7h7M6 11h4" />
      <circle cx="16" cy="16" r="4" />
      <path d="m19 19 3 3" />
    </svg>
  );
}
export function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="20"
      height="20"
      fill="currentColor"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
