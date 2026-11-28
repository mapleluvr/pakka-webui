import type { ReactNode, SVGProps } from "react";

const drawings = {
  pin: <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6m3 12v6" />,
  link: (
    <path d="m9 15 6-6m-8 5-2 2a4 4 0 0 0 6 5l3-3m-3-12 3-3a4 4 0 0 1 6 5l-2 2" />
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7 9 3 3-3 3m6 0h4" />
    </>
  ),
  file: (
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 13h8m-8 4h5" />
  ),
  edit: <path d="m15 4 5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16Z" />,
  code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" />,
  tool: (
    <path d="M14 6a5 5 0 0 0-6 6L3.8 17a2.2 2.2 0 0 0 3.2 3.2l5-4.3A6 6 0 0 0 20 8l-4 3-3-2 3-4Z" />
  ),
  thought: (
    <path d="M9 18h6m-5 3h4M8 15a6 6 0 1 1 8 0c-1 .8-1 1-1 3H9c0-2 0-2.2-1-3Z" />
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6m0 4h.01" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  spinner: <path d="M12 3a9 9 0 1 1-9 9" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
    </>
  ),
  expand: <path d="M14 3h7v7m0-7-8 8M10 21H3v-7m0 7 8-8" />,
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </g>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type UiIconName = keyof typeof drawings;

/** Decorative SVG. Its control or adjacent text supplies the accessible name. */
export function UiIcon({
  name,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "name" | "children"> & { name: UiIconName }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      aria-hidden="true"
      focusable="false"
    >
      {drawings[name]}
    </svg>
  );
}
