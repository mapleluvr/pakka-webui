import { useSyncExternalStore } from "react";

export type Appearance = {
  mode: "system" | "light" | "dark";
  font: "system" | "serif" | "mono";
  size: 16 | 18 | 20 | 22 | 24;
};
const key = "pakka-webui-appearance-v1";
export const defaultAppearance: Appearance = {
  mode: "system",
  font: "system",
  size: 16,
};
export const textSizes = [16, 18, 20, 22, 24] as const;

function decode(raw: string | null): Appearance {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("mode" in value) ||
      !("font" in value) ||
      !("size" in value)
    )
      return defaultAppearance;
    const mode =
      value.mode === "light" || value.mode === "dark" ? value.mode : "system";
    const font =
      value.font === "serif" || value.font === "mono" ? value.font : "system";
    const size = textSizes.find((size) => size === value.size) ?? 16;
    return { mode, font, size };
  } catch {
    return defaultAppearance;
  }
}
function load() {
  try {
    return { preferences: decode(localStorage.getItem(key)), saved: true };
  } catch {
    return { preferences: defaultAppearance, saved: false };
  }
}
let state = load();
const listeners = new Set<() => void>();
function apply() {
  document.documentElement.dataset.readingFont = state.preferences.font;
  document.documentElement.dataset.readingSize = String(state.preferences.size);
}
apply();
function notify() {
  apply();
  for (const listener of listeners) listener();
}
function storage(event: StorageEvent) {
  if (event.key !== key && event.key !== null) return;
  state = {
    preferences: decode(event.key === null ? null : event.newValue),
    saved: true,
  };
  notify();
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", storage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", storage);
  };
}
export function useAppearance() {
  return useSyncExternalStore(subscribe, () => state);
}
export function changeAppearance(preferences: Appearance) {
  let saved = true;
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    saved = false;
  }
  state = { preferences, saved };
  notify();
}
