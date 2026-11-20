export function readPending<T>(
  key: string,
  decode: (value: unknown) => T,
): T | "unreadable" | null {
  try {
    const text = sessionStorage.getItem(key);
    return text === null ? null : decode(JSON.parse(text));
  } catch {
    return "unreadable";
  }
}

/** One unresolved request per setting/resource in this tab, including all its mounted views. */
export function claimPending<T extends { readonly requestId: string }>(
  key: string,
  value: T,
  decode: (value: unknown) => T,
): T | "unreadable" {
  const existing = readPending(key, decode);
  if (existing) return existing;
  // No await between reading and reserving the tab's slot. Validation may have yielded before this call.
  sessionStorage.setItem(key, JSON.stringify(value));
  return value;
}

/** A late result can only acknowledge its own request, never another view's newer admission. */
export function clearPending<T extends { readonly requestId: string }>(
  key: string,
  requestId: string,
  decode: (value: unknown) => T,
): T | "unreadable" | null {
  const existing = readPending(key, decode);
  if (
    existing &&
    existing !== "unreadable" &&
    existing.requestId === requestId
  ) {
    sessionStorage.removeItem(key);
    return null;
  }
  return existing;
}
